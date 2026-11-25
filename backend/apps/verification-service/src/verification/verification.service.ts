import { Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import type { ActivitiesService } from '../../../activity-service/src/activity/activities.service.js';
import { WAITING_STATUSES } from '../../../activity-service/src/activity/activities.service.js';
import type { ActivityTypesService } from '../../../activity-service/src/activity/activity-types.service.js';
import { RULES_VERSION } from '../../../activity-service/src/activity/submission-rules.js';
import type { AuditService } from '../audit/audit.service.js';
import { ModelError } from '../../../../libs/integration/ai/multimodal-model.js';
import type { PhotoStorage } from '../../../../libs/integration/storage/photo-storage.js';
import { buildAgentInput } from './agent-input.js';
import { AgentTechnicalError, type VerificationAgent } from './agent/verification-agent.js';
import { decideOutcome, type Thresholds } from './decide-outcome.js';
import type { JobOutcome, JobRecord, JobStore } from './job-store.js';
import { retryPolicy, type RetryConfig } from './retry-policy.js';

export interface VerificationServiceDeps {
  activities: Pick<ActivitiesService, 'getForVerification' | 'decide' | 'markPending' | 'findWaiting'>;
  types: Pick<ActivityTypesService, 'findById'>;
  photos: Pick<PhotoStorage, 'read'>;
  agent: Pick<VerificationAgent, 'assess'>;
  audit: Pick<AuditService, 'append'>;
  store: JobStore;
  thresholds: Thresholds;
  retry: RetryConfig;
  leaseMs: number;
  batchSize: number;
  /** Injected clock for deterministic tests. */
  now?: () => Date;
}

/** A failure that is not a model error but is still technical (never a decision). */
class ProcessingError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProcessingError';
  }
}

/** The decision is stored but its audit entry is not: keep the job not-done and retry only the append (FR-054). */
class AuditPendingError extends Error {
  constructor(readonly result: JobOutcome) {
    super('audit.appendFailed');
    this.name = 'AuditPendingError';
  }
}

/**
 * Verification pipeline (plan section 3, ADR-0012): job queue + attempt. AI output is advisory (FR-025): only a
 * score and flags are stored. Any technical failure parks the activity as pending_technical_processing and
 * schedules a retry; it is never turned into a decision (FR-028).
 */
export class VerificationService {
  private readonly logger = new Logger('VerificationService');
  private readonly now: () => Date;
  private sweeping = false;

  constructor(private readonly deps: VerificationServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** ActivitySubmitted handler: idempotent enqueue (FR-015, FR-028), then an immediate attempt. */
  async onSubmitted(activityId: string): Promise<void> {
    await this.deps.store.enqueue(activityId, this.now());
    const job = await this.deps.store.claimOne(activityId, this.now(), this.deps.leaseMs);
    if (job) await this.runJob(job);
  }

  /**
   * One sweep: re-enqueue submitted activities that have no job, then process due jobs (each claimed with a
   * lease, so several instances can sweep at once, NFR-027). Overlapping sweeps in one process are skipped.
   */
  async sweep(): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    let processed = 0;
    try {
      const waiting = await this.deps.activities.findWaiting(this.now(), this.deps.batchSize);
      for (const a of waiting) await this.deps.store.enqueue(String(a._id), this.now());
      for (let i = 0; i < this.deps.batchSize; i++) {
        const job = await this.deps.store.claimDue(this.now(), this.deps.leaseMs);
        if (!job) break;
        await this.runJob(job);
        processed++;
      }
    } catch (err) {
      this.logger.error(`Sweep failed: ${err instanceof Error ? err.name : 'error'}`);
    } finally {
      this.sweeping = false;
    }
    return processed;
  }

  /** Runs one claimed job to done, retry or exhausted. */
  async runJob(job: JobRecord): Promise<void> {
    try {
      const result = await this.assessAndDecide(job);
      this.noteLease(job, await this.deps.store.done(job, result));
    } catch (err) {
      if (err instanceof AuditPendingError) await this.retryAudit(job, err.result);
      else await this.failTechnically(job, err);
    }
  }

  /** A write that matched nothing means another worker holds the job now: do nothing more (security review S2-2). */
  private noteLease(job: JobRecord, held: boolean): void {
    if (!held) this.logger.warn(`Lost job lease (activityId=${job.activityId}, attempt=${job.attempts})`);
  }

  private async assessAndDecide(job: JobRecord): Promise<JobOutcome | null> {
    const { activities, types, photos, agent, thresholds } = this.deps;
    const activityId = job.activityId;
    // A previous attempt decided but could not write the audit entry: append it from the stored decision only.
    // The AI is not called again and no event is published a second time (FR-015, FR-054).
    if (job.result) {
      const stored = job.result;
      await this.audit(activityId, stored).catch(() => {
        throw new AuditPendingError(stored);
      });
      return stored;
    }
    const subject = await activities.getForVerification(activityId);
    // Already decided (another worker, or an earlier attempt that finished): nothing left to do.
    if (!subject || !(WAITING_STATUSES as readonly string[]).includes(subject.status)) return null;

    const type = await types.findById(subject.activityTypeId);
    const loaded: { kind: string; mimeType: string; data: Uint8Array }[] = [];
    for (const p of subject.photos) {
      const file = await photos.read(p.fileId);
      if (!file) throw new ProcessingError('processing.photoMissing');
      loaded.push({ kind: p.kind, mimeType: file.mimeType, data: new Uint8Array(file.buffer) });
    }

    const assessment = await agent.assess(buildAgentInput(subject, type, loaded));
    const outcome = decideOutcome(assessment.score, thresholds); // throws on an invalid score: technical failure
    const decided = await activities.decide(new Types.ObjectId(activityId), outcome.status, outcome.reasonCode);
    // Only the winning write audits and continues (FR-015, FR-028, FR-054).
    if (!decided) return null;
    const result: JobOutcome = {
      score: assessment.score,
      flags: assessment.flags,
      outcome: outcome.status,
      steps: assessment.steps.map((s) => ({ tag: s.step, modelVersion: s.modelVersion })),
      providerId: assessment.providerId,
      modelVersions: assessment.modelVersions,
      promptVersion: assessment.promptVersion,
      schemaVersion: assessment.schemaVersion,
      aggregationVersion: assessment.aggregationVersion,
      callCount: assessment.callCount,
      assessedAt: this.now(),
    };
    try {
      await this.audit(activityId, result);
    } catch {
      // The decision is already stored and its events published: never undo or re-run it, only retry the append.
      throw new AuditPendingError(result);
    }
    return result;
  }

  private async retryAudit(job: JobRecord, result: JobOutcome): Promise<void> {
    this.logger.error(`Audit append failed (activityId=${job.activityId}, attempt=${job.attempts})`);
    const decision = retryPolicy(job.attempts, this.deps.retry, this.now());
    const code = 'audit.appendFailed';
    const held =
      decision.action === 'retry'
        ? await this.deps.store.retryAt(job, decision.nextAttemptAt, code, result)
        : await this.deps.store.exhaust(job, code);
    this.noteLease(job, held);
  }

  /** Decision entry plus one entry per flag; IDs, codes and versions only (ADR-0008, FR-054). */
  private async audit(activityId: string, a: JobOutcome): Promise<void> {
    const base = {
      at: a.assessedAt,
      recordType: 'activity',
      recordId: activityId,
      ruleVersion: RULES_VERSION,
      modelVersion: a.modelVersions.join(',') || 'none',
      outcome: a.outcome,
      score: a.score,
      providerId: a.providerId,
    };
    await this.deps.audit.append({
      ...base,
      action: 'verification.decision',
      promptVersion: a.promptVersion,
      schemaVersion: a.schemaVersion,
      aggregationVersion: a.aggregationVersion,
      callCount: a.callCount,
      steps: a.steps.map((s) => ({ tag: s.tag, modelVersion: s.modelVersion, providerId: a.providerId })),
      idempotencyKey: `decision:${activityId}`,
    });
    for (const flag of new Set(a.flags)) {
      await this.deps.audit.append({
        ...base,
        action: 'verification.aiFlag',
        flagCode: `ai.${flag}`,
        idempotencyKey: `flag:${activityId}:${flag}`,
      });
    }
  }

  /** Technical failure: pending + backoff, or exhausted after VERIFY_MAX_ATTEMPTS (Q-E4). */
  private async failTechnically(job: JobRecord, err: unknown): Promise<void> {
    const code = technicalCode(err);
    const decision = retryPolicy(job.attempts, this.deps.retry, this.now());
    this.logger.warn(`Verification attempt ${job.attempts} failed (activityId=${job.activityId}, code=${code})`);
    const id = new Types.ObjectId(job.activityId);
    await this.deps.activities.markPending(id, decision.reasonCode);
    const held =
      decision.action === 'retry'
        ? await this.deps.store.retryAt(job, decision.nextAttemptAt, code)
        : await this.deps.store.exhaust(job, code);
    this.noteLease(job, held);
  }
}

/** A stable code for the job record; never an error message (it could carry content). */
export function technicalCode(err: unknown): string {
  if (err instanceof AgentTechnicalError || err instanceof ProcessingError) return err.code;
  if (err instanceof ModelError) return `ai.${err.kind}`;
  if (err instanceof RangeError) return 'processing.invalidScore';
  return 'processing.error';
}

import { jest } from '@jest/globals';
import { Types } from 'mongoose';
import { createLocationCipher } from '../../../../libs/common/config/app-config.js';
import { InMemoryEventBus } from '../../../../libs/messaging/index.js';
import { createEnvelope } from '../../../../libs/contracts/index.js';
import { ActivitiesService } from '../../../activity-service/src/activity/activities.service.js';
import type { AuditEntryInput } from '../audit/audit.service.js';
import type { ImagePreparer } from '../../../../libs/integration/ai/image-prep.js';
import { MockMultimodalModel } from '../../../../libs/integration/ai/mock-multimodal-model.js';
import {
  ModelError,
  type GenerateRequest,
  type MultimodalModel,
} from '../../../../libs/integration/ai/multimodal-model.js';
import { InMemoryPhotoStorage } from '../../../../libs/integration/storage/in-memory-photo-storage.js';
import { AgentTechnicalError, VerificationAgent, type AgentAssessment } from './agent/verification-agent.js';
import { buildAgentInput } from './agent-input.js';
import type { JobOutcome, JobRecord, JobStore } from './job-store.js';
import { parseWorkerConfig } from './verification-config.js';
import { technicalCode, VerificationService } from './verification.service.js';
import { VerificationWorker } from './verification.worker.js';

// ---------- in-memory fakes ----------
type Doc = Record<string, unknown> & { _id: Types.ObjectId; status: string };

/** Just enough of a Mongoose model for ActivitiesService: conditional findOneAndUpdate, findOne, find. */
class FakeActivityModel {
  readonly docs = new Map<string, Doc>();
  private lean<T>(v: T) {
    return { lean: () => Promise.resolve(v), sort: () => this.lean(v), limit: () => this.lean(v) };
  }
  findOne(filter: { _id: Types.ObjectId }) {
    return this.lean(this.docs.get(String(filter._id)) ?? null);
  }
  find(filter: { status: string }) {
    return this.lean([...this.docs.values()].filter((d) => d.status === filter.status));
  }
  findOneAndUpdate(
    filter: { _id: Types.ObjectId; status: string; resultReasonCode?: { $ne: string } },
    update: { $set: Record<string, unknown>; $push: { statusHistory: unknown } },
  ) {
    const d = this.docs.get(String(filter._id));
    const matches =
      d &&
      d.status === filter.status &&
      (!filter.resultReasonCode || d.resultReasonCode !== filter.resultReasonCode.$ne);
    if (!d || !matches) return this.lean(null);
    Object.assign(d, update.$set);
    (d.statusHistory as unknown[]).push(update.$push.statusHistory);
    return this.lean({ ...d });
  }
}

class FakeJobStore implements JobStore {
  readonly jobs = new Map<string, JobRecord & { result: JobOutcome | null }>();
  enqueue(activityId: string, now: Date) {
    if (this.jobs.has(activityId)) return Promise.resolve(false);
    this.jobs.set(activityId, {
      activityId,
      state: 'queued',
      attempts: 0,
      nextAttemptAt: now,
      lockedUntil: null,
      lastErrorCode: null,
      result: null,
    });
    return Promise.resolve(true);
  }
  private claim(pick: (j: JobRecord) => boolean, now: Date, leaseMs: number): Promise<JobRecord | null> {
    const j = [...this.jobs.values()].find(
      (x) =>
        pick(x) &&
        ((x.state === 'queued' && x.nextAttemptAt <= now) || (x.state === 'running' && x.lockedUntil! < now)),
    );
    if (!j) return Promise.resolve(null);
    j.state = 'running';
    j.attempts += 1;
    j.lockedUntil = new Date(now.getTime() + leaseMs);
    return Promise.resolve({ ...j });
  }
  claimDue(now: Date, leaseMs: number) {
    return this.claim(() => true, now, leaseMs);
  }
  claimOne(id: string, now: Date, leaseMs: number) {
    return this.claim((j) => j.activityId === id, now, leaseMs);
  }
  /** Same fence as MongoJobStore: only the current claim (running, same attempt) may write. */
  private fenced(job: JobRecord, set: Record<string, unknown>): Promise<boolean> {
    const j = this.jobs.get(job.activityId);
    if (!j || j.state !== 'running' || j.attempts !== job.attempts) return Promise.resolve(false);
    Object.assign(j, set);
    return Promise.resolve(true);
  }
  done(job: JobRecord, result: JobOutcome | null) {
    return this.fenced(job, { state: 'done', lockedUntil: null, result });
  }
  retryAt(job: JobRecord, nextAttemptAt: Date, code: string, result?: JobOutcome | null) {
    return this.fenced(job, {
      state: 'queued',
      nextAttemptAt,
      lockedUntil: null,
      lastErrorCode: code,
      ...(result !== undefined ? { result } : {}),
    });
  }
  exhaust(job: JobRecord, code: string) {
    return this.fenced(job, { state: 'exhausted', lockedUntil: null, lastErrorCode: code });
  }
}

class FakeAudit {
  readonly entries = new Map<string, AuditEntryInput>();
  failNext = false;
  append(input: AuditEntryInput) {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('db down'));
    }
    const created = !this.entries.has(input.idempotencyKey);
    if (created) this.entries.set(input.idempotencyKey, input);
    return Promise.resolve({ entry: this.entries.get(input.idempotencyKey)!, created });
  }
}

/** Delegates to whichever mock is current, so a test can switch the model from "down" to "up". */
class SwitchModel implements MultimodalModel {
  current: MultimodalModel;
  constructor(initial: MultimodalModel) {
    this.current = initial;
  }
  generate(req: GenerateRequest) {
    return this.current.generate(req);
  }
}

const preparer: ImagePreparer = { prepare: (photos) => Promise.resolve(photos.map((p) => ({ ...p }))) };
const cipher = createLocationCipher('ab'.repeat(32));
const type = {
  _id: new Types.ObjectId(),
  code: 'TREE',
  category: 'planting',
  description: { en: 'Planting a tree', ar: 'x' },
  photoRules: { minPhotos: 1, maxPhotos: 2, neededKinds: [] as string[], maxSizeMB: 1 },
};
const agentConfig = {
  maxCalls: 5,
  totalBudgetMs: 24000,
  minCallMs: 3000,
  perCallTimeoutMs: 20000,
  followupBelow: 0.5,
  imageMaxPx: 800,
  maxImages: 6,
  maxOutputTokens: 700,
};
const T0 = new Date('2026-11-25T10:00:00Z');

function setup(opts: { agent?: { assess: (i: unknown) => Promise<AgentAssessment> }; model?: MultimodalModel } = {}) {
  const clock = { t: T0.getTime() };
  const now = () => new Date(clock.t);
  const model = new SwitchModel(opts.model ?? new MockMultimodalModel({ mode: 'fixed', score: 0.95 }));
  const events = new InMemoryEventBus();
  const published: { name: string; payload: unknown }[] = [];
  const realPublish = events.publish.bind(events);
  jest.spyOn(events, 'publish').mockImplementation((envelope) => {
    published.push({ name: envelope.type, payload: envelope });
    return realPublish(envelope);
  });
  const photos = new InMemoryPhotoStorage();
  const activityModel = new FakeActivityModel();
  const activities = new ActivitiesService(
    activityModel as never,
    { findById: () => Promise.resolve(type), findByIds: () => Promise.resolve([type]) } as never,
    photos,
    events,
    {} as never,
    cipher,
  );
  const store = new FakeJobStore();
  const audit = new FakeAudit();
  const build = () =>
    new VerificationService({
      activities,
      types: { findById: () => Promise.resolve(type as never) },
      photos,
      agent: opts.agent ?? new VerificationAgent(model, preparer, agentConfig),
      audit,
      store,
      thresholds: { accept: 0.7, reject: 0.3 },
      retry: { maxAttempts: 3, backoffBaseMs: 1000 },
      leaseMs: 60000,
      batchSize: 5,
      now,
    });
  const svc = build();

  const addActivity = async (status = 'submitted') => {
    const stored = await photos.save(
      { originalname: 'p.jpg', mimetype: 'image/jpeg', size: 3, buffer: Buffer.from([1, 2, 3]) },
      { userId: 'u', kind: 'photo' },
    );
    const id = new Types.ObjectId();
    activityModel.docs.set(String(id), {
      _id: id,
      userId: new Types.ObjectId(),
      activityTypeId: type._id,
      status,
      description: 'Planted',
      doneAt: new Date('2026-11-24T00:00:00Z'),
      locationEnc: cipher.encryptJson({ emirate: 'Dubai', area: '' }),
      answers: {},
      amount: { value: 2, unit: 'trees' },
      photos: [{ fileId: stored.fileId, kind: 'photo', mimeType: 'image/jpeg' }],
      resultReasonCode: null,
      statusHistory: [{ from: null, to: 'submitted', reasonCode: null, at: T0 }],
      submittedAt: T0,
    });
    return String(id);
  };
  return { svc, build, store, audit, model, clock, activityModel, addActivity, published, events, photos, now };
}

const assessment = (score: number, flags: string[] = []): AgentAssessment => ({
  score,
  flags,
  reasonCodes: [],
  providerId: 'mock',
  steps: [{ step: 'evidence', modelVersion: 'mock-1', repaired: false }],
  modelVersions: ['mock-1'],
  promptVersion: 'p1',
  schemaVersion: 's1',
  aggregationVersion: 'a1',
  callCount: 2,
  findings: {} as never,
});
const fixedAgent = (score: number, flags: string[] = []) => ({
  assess: () => Promise.resolve(assessment(score, flags)),
});

describe('VerificationService', () => {
  it('accepts a good submission, audits it and publishes both events once (FR-025, FR-026, FR-054)', async () => {
    const s = setup();
    const id = await s.addActivity();
    await s.svc.onSubmitted(id);
    const doc = s.activityModel.docs.get(id)!;
    expect(doc.status).toBe('accepted');
    expect(s.store.jobs.get(id)).toMatchObject({ state: 'done', attempts: 1 });
    expect(s.store.jobs.get(id)!.result).toMatchObject({
      outcome: 'accepted',
      modelVersions: ['mock-1'],
      callCount: 2,
    });
    const decision = s.audit.entries.get(`decision:${id}`)!;
    expect(decision).toMatchObject({
      action: 'verification.decision',
      recordId: id,
      outcome: 'accepted',
      ruleVersion: 'rules-2',
      promptVersion: expect.any(String),
      modelVersion: 'mock-1',
    });
    expect(s.published.map((p) => p.name)).toEqual(['ActivityDecided', 'ActivityAccepted']);
    expect(s.published[1]!.payload).toMatchObject({
      activityId: id,
      payload: { activityTypeCode: 'TREE', amount: { value: 2 } },
    });
  });

  it('returns for correction below the accept threshold and rejects below the reject threshold (FR-026, FR-027)', async () => {
    const s1 = setup({ agent: fixedAgent(0.5) });
    const a = await s1.addActivity();
    await s1.svc.onSubmitted(a);
    expect(s1.activityModel.docs.get(a)).toMatchObject({
      status: 'returned_for_correction',
      resultReasonCode: 'verification.evidenceUnclear',
    });
    expect(s1.published.map((p) => p.name)).toEqual(['ActivityDecided']);

    const s2 = setup({ agent: fixedAgent(0.1) });
    const b = await s2.addActivity();
    await s2.svc.onSubmitted(b);
    expect(s2.activityModel.docs.get(b)).toMatchObject({
      status: 'rejected',
      resultReasonCode: 'verification.evidenceUnrelated',
    });
    expect(s2.published.some((p) => p.name === 'ActivityAccepted')).toBe(false);
  });

  it('writes one audit entry per flag with ai.<flag> codes, IDs and codes only (ADR-0008)', async () => {
    const s = setup({ agent: fixedAgent(0.9, ['low_quality', 'low_quality', 'people_visible']) });
    const id = await s.addActivity();
    await s.svc.onSubmitted(id);
    expect([...s.audit.entries.keys()].sort()).toEqual(
      [`decision:${id}`, `flag:${id}:low_quality`, `flag:${id}:people_visible`].sort(),
    );
    expect(s.audit.entries.get(`flag:${id}:low_quality`)).toMatchObject({
      action: 'verification.aiFlag',
      flagCode: 'ai.low_quality',
    });
    expect(JSON.stringify([...s.audit.entries.values()])).not.toContain('Planted');
  });

  it('keeps the job not-done when the audit append fails, then appends once without re-deciding (FR-054, S2-3)', async () => {
    const s = setup();
    const id = await s.addActivity();
    s.audit.failNext = true;
    await s.svc.onSubmitted(id);
    expect(s.activityModel.docs.get(id)!.status).toBe('accepted');
    expect(s.store.jobs.get(id)).toMatchObject({ state: 'queued', lastErrorCode: 'audit.appendFailed' });
    expect(s.audit.entries.size).toBe(0);
    // retry after backoff: no second AI call, no second event, audit written from the stored decision
    const calls = s.model.current as MockMultimodalModel;
    const before = calls.calls.length;
    s.clock.t += 1001;
    expect(await s.svc.sweep()).toBe(1);
    expect(calls.calls.length).toBe(before);
    expect(s.store.jobs.get(id)!.state).toBe('done');
    expect(s.audit.entries.get(`decision:${id}`)).toMatchObject({ outcome: 'accepted', recordId: id });
    expect(s.published.filter((p) => p.name === 'ActivityDecided')).toHaveLength(1);
    expect(s.published.filter((p) => p.name === 'ActivityAccepted')).toHaveLength(1);
  });

  it('keeps retrying a failing audit append until attempts run out, then exhausts (FR-054)', async () => {
    const s = setup();
    const id = await s.addActivity();
    jest.spyOn(s.audit, 'append').mockRejectedValue(new Error('db down'));
    await s.svc.onSubmitted(id);
    for (let i = 0; i < 2; i++) {
      s.clock.t += 60000;
      await s.svc.sweep();
    }
    expect(s.store.jobs.get(id)).toMatchObject({ state: 'exhausted', lastErrorCode: 'audit.appendFailed' });
    expect(s.published.filter((p) => p.name === 'ActivityDecided')).toHaveLength(1);
  });

  it('a worker whose lease expired cannot overwrite the new owner result (S2-2)', async () => {
    const s = setup();
    const id = await s.addActivity();
    await s.store.enqueue(id, T0);
    const stale = (await s.store.claimOne(id, T0, 1000))!; // worker A, attempt 1, then stalls
    s.clock.t += 2000;
    const fresh = (await s.store.claimDue(s.now(), 60000))!; // worker B reclaims, attempt 2
    expect(fresh.attempts).toBe(2);
    expect(await s.store.done(stale, null)).toBe(false);
    expect(await s.store.retryAt(stale, T0, 'x')).toBe(false);
    expect(await s.store.exhaust(stale, 'x')).toBe(false);
    expect(s.store.jobs.get(id)).toMatchObject({ state: 'running', attempts: 2, lastErrorCode: null });
    await s.svc.runJob(stale); // stale worker finishes: decides idempotently but cannot touch the job
    expect(s.store.jobs.get(id)).toMatchObject({ state: 'running', attempts: 2 });
    expect(await s.store.done(fresh, null)).toBe(true);
  });

  it('a stale worker failing technically cannot requeue the job either (S2-2)', async () => {
    const s = setup({ model: new MockMultimodalModel({ mode: 'unavailable' }) });
    const id = await s.addActivity();
    await s.store.enqueue(id, T0);
    const stale = (await s.store.claimOne(id, T0, 1000))!;
    s.clock.t += 2000;
    await s.store.claimDue(s.now(), 60000);
    await s.svc.runJob(stale);
    expect(s.store.jobs.get(id)).toMatchObject({ state: 'running', attempts: 2, lastErrorCode: null });
  });

  it('goes pending on an AI outage, retries with backoff, then accepts once the model is back (FR-028)', async () => {
    const s = setup({ model: new MockMultimodalModel({ mode: 'unavailable' }) });
    const id = await s.addActivity();
    await s.svc.onSubmitted(id);
    expect(s.activityModel.docs.get(id)).toMatchObject({
      status: 'pending_technical_processing',
      resultReasonCode: 'processing.retrying',
    });
    const job = s.store.jobs.get(id)!;
    expect(job).toMatchObject({ state: 'queued', attempts: 1, lastErrorCode: 'ai.unavailable' });
    expect(job.nextAttemptAt.getTime()).toBe(T0.getTime() + 1000);
    expect(s.published).toEqual([]);
    expect(s.audit.entries.size).toBe(0);

    expect(await s.svc.sweep()).toBe(0); // not due yet
    s.model.current = new MockMultimodalModel({ mode: 'fixed', score: 0.95 });
    s.clock.t += 1000;
    expect(await s.svc.sweep()).toBe(1);
    expect(s.activityModel.docs.get(id)).toMatchObject({ status: 'accepted', resultReasonCode: null });
    const history = s.activityModel.docs.get(id)!.statusHistory as { from: string; to: string }[];
    expect(history.map((h) => `${h.from}>${h.to}`)).toEqual([
      'null>submitted',
      'submitted>pending_technical_processing',
      'pending_technical_processing>accepted',
    ]);
    expect(s.published.map((p) => p.name)).toEqual(['ActivityDecided', 'ActivityAccepted']);
  });

  it('exhausts after the maximum attempts with processing.failedPermanently (Q-E4)', async () => {
    const s = setup({ model: new MockMultimodalModel({ mode: 'unavailable' }) });
    const id = await s.addActivity();
    await s.svc.onSubmitted(id); // attempt 1, retry in 1 s
    s.clock.t += 1000;
    await s.svc.sweep(); // attempt 2, retry in 2 s
    expect(s.store.jobs.get(id)!.nextAttemptAt.getTime()).toBe(s.clock.t + 2000);
    s.clock.t += 2000;
    await s.svc.sweep(); // attempt 3 = max
    expect(s.store.jobs.get(id)).toMatchObject({ state: 'exhausted', attempts: 3 });
    expect(s.activityModel.docs.get(id)).toMatchObject({
      status: 'pending_technical_processing',
      resultReasonCode: 'processing.failedPermanently',
    });
    s.clock.t += 999999;
    expect(await s.svc.sweep()).toBe(0);
    expect(s.published).toEqual([]);
  });

  it('never accepts after malformed model output, even twice (FR-025, FR-028)', async () => {
    const s = setup({ model: new MockMultimodalModel({ mode: 'malformed' }) });
    const id = await s.addActivity();
    await s.svc.onSubmitted(id);
    s.clock.t += 1000;
    await s.svc.sweep();
    expect(s.activityModel.docs.get(id)!.status).toBe('pending_technical_processing');
    expect(s.store.jobs.get(id)!.lastErrorCode).toBe('ai.invalidOutput');
    expect(s.published).toEqual([]);
    expect(s.audit.entries.size).toBe(0);
  });

  it('treats an invalid score or a missing photo as a technical failure, never a decision (FR-028)', async () => {
    const s = setup({ agent: fixedAgent(Number.NaN) });
    const a = await s.addActivity();
    await s.svc.onSubmitted(a);
    expect(s.store.jobs.get(a)!.lastErrorCode).toBe('processing.invalidScore');
    expect(s.activityModel.docs.get(a)!.status).toBe('pending_technical_processing');

    const s2 = setup();
    const b = await s2.addActivity();
    s2.photos.files.clear();
    await s2.svc.onSubmitted(b);
    expect(s2.store.jobs.get(b)!.lastErrorCode).toBe('processing.photoMissing');
  });

  it('does one job for a duplicate ActivitySubmitted (FR-015, FR-028)', async () => {
    const model = new MockMultimodalModel({ mode: 'fixed', score: 0.95 });
    const s = setup({ model });
    const id = await s.addActivity();
    await Promise.all([s.svc.onSubmitted(id), s.svc.onSubmitted(id)]);
    await s.svc.onSubmitted(id);
    expect(s.store.jobs.size).toBe(1);
    expect(s.store.jobs.get(id)!.attempts).toBe(1);
    expect(s.published.filter((p) => p.name === 'ActivityDecided')).toHaveLength(1);
    expect(model.calls.filter((c) => c.requestTag === 'evidence')).toHaveLength(1);
  });

  it('lets only one of two racing workers decide, publish and audit (FR-015, FR-028, NFR-027)', async () => {
    const s = setup();
    const id = await s.addActivity();
    const other = s.build();
    await s.store.enqueue(id, T0);
    const job: JobRecord = {
      activityId: id,
      state: 'running',
      attempts: 1,
      nextAttemptAt: T0,
      lockedUntil: null,
      lastErrorCode: null,
    };
    await Promise.all([s.svc.runJob(job), other.runJob(job)]);
    expect(s.published.filter((p) => p.name === 'ActivityDecided')).toHaveLength(1);
    expect(s.published.filter((p) => p.name === 'ActivityAccepted')).toHaveLength(1);
    expect(s.audit.entries.size).toBe(1);
    expect(s.activityModel.docs.get(id)!.status).toBe('accepted');
  });

  it('does nothing for an activity that is already decided or missing', async () => {
    const s = setup();
    const id = await s.addActivity('accepted');
    await s.svc.onSubmitted(id);
    expect(s.store.jobs.get(id)).toMatchObject({ state: 'done' });
    expect(s.published).toEqual([]);
    const ghost = String(new Types.ObjectId());
    await s.svc.onSubmitted(ghost);
    expect(s.store.jobs.get(ghost)!.state).toBe('done');
    await s.svc.onSubmitted(
      'not-an-id'
        .padEnd(24, '0')
        .slice(0, 24)
        .replace(/[^0-9a-f]/g, '0'),
    );
  });

  it('re-enqueues submitted activities that lack a job and processes them (FR-028)', async () => {
    const s = setup();
    const id = await s.addActivity();
    expect(await s.svc.sweep()).toBe(1);
    expect(s.activityModel.docs.get(id)!.status).toBe('accepted');
  });

  it('reclaims a job whose worker died once the lease expired (NFR-027)', async () => {
    const s = setup();
    const id = await s.addActivity();
    await s.store.enqueue(id, T0);
    await s.store.claimOne(id, T0, 60000); // worker crashes here
    expect(await s.svc.sweep()).toBe(0);
    s.clock.t += 60001;
    expect(await s.svc.sweep()).toBe(1);
    expect(s.activityModel.docs.get(id)!.status).toBe('accepted');
  });

  it('survives a failing sweep and skips an overlapping one', async () => {
    const s = setup();
    jest.spyOn(s.store, 'claimDue').mockRejectedValue(new Error('db'));
    await s.addActivity();
    expect(await s.svc.sweep()).toBe(0);
    jest.spyOn(s.store, 'claimDue').mockImplementation(() => new Promise(() => undefined));
    const first = s.svc.sweep();
    expect(await s.svc.sweep()).toBe(0);
    void first;
  });
});

describe('technicalCode', () => {
  it('maps errors to stable codes without messages', () => {
    expect(technicalCode(new AgentTechnicalError('ai.timeout', true))).toBe('ai.timeout');
    expect(technicalCode(new ModelError('refused', 'secret'))).toBe('ai.refused');
    expect(technicalCode(new RangeError('x'))).toBe('processing.invalidScore');
    expect(technicalCode(new Error('secret'))).toBe('processing.error');
  });
});

describe('buildAgentInput', () => {
  it('has no coordinates or ids, only a date, and requires before/after for types needing both (FR-011)', () => {
    const t = { ...type, photoRules: { ...type.photoRules, neededKinds: ['before', 'after'] } };
    const input = buildAgentInput(
      {
        id: 'a',
        userId: 'u-secret',
        activityTypeId: 't',
        status: 'submitted',
        description: 'd',
        doneAt: new Date('2026-11-24T23:00:00Z'),
        answers: { n: 3 },
        amount: { value: 1, unit: 'kg' },
        photos: [],
        emirate: 'Dubai',
      },
      t as never,
      [],
    );
    expect(input.type.requiresBeforeAfter).toBe(true);
    expect(input.doneAtDate).toBe('2026-11-24');
    expect(input.answers).toEqual([{ key: 'n', value: '3' }]);
    expect(JSON.stringify(input)).not.toContain('u-secret');
  });
});

describe('VerificationWorker', () => {
  const mk = (enabled: boolean) => {
    const service = { onSubmitted: jest.fn(() => Promise.resolve()), sweep: jest.fn(() => Promise.resolve(0)) };
    const events = new InMemoryEventBus();
    const worker = new VerificationWorker(service as never, events, { enabled, pollMs: 1000 });
    return { service, events, worker };
  };

  it('does not run until started explicitly; disabled config never starts', () => {
    jest.useFakeTimers();
    const { service, events, worker } = mk(false);
    worker.onModuleInit();
    jest.advanceTimersByTime(5000);
    void events.publish(
      createEnvelope('ActivitySubmitted', 'a0', 'activity-service', {
        userId: 'u',
        activityTypeCode: 'T',
        category: 'c',
        submittedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(service.sweep).not.toHaveBeenCalled();
    expect(service.onSubmitted).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('sweeps on the interval, attempts on ActivitySubmitted, and stops cleanly', async () => {
    jest.useFakeTimers();
    const { service, events, worker } = mk(true);
    worker.onModuleInit();
    worker.start(); // second start is a no-op
    jest.advanceTimersByTime(2000);
    expect(service.sweep).toHaveBeenCalledTimes(2);
    void events.publish(
      createEnvelope('ActivitySubmitted', 'a1', 'activity-service', {
        userId: 'u',
        activityTypeCode: 'T',
        category: 'c',
        submittedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(service.onSubmitted).toHaveBeenCalledWith('a1');
    await worker.onModuleDestroy();
    jest.advanceTimersByTime(5000);
    expect(service.sweep).toHaveBeenCalledTimes(2);
    void events.publish(
      createEnvelope('ActivitySubmitted', 'a2', 'activity-service', {
        userId: 'u',
        activityTypeCode: 'T',
        category: 'c',
        submittedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(service.onSubmitted).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('parseWorkerConfig', () => {
  it('defaults on, validates the switch and numbers', () => {
    expect(parseWorkerConfig({})).toEqual({ enabled: true, leaseMs: 60000, batchSize: 5 });
    expect(parseWorkerConfig({ VERIFY_WORKER: 'OFF' }).enabled).toBe(false);
    expect(() => parseWorkerConfig({ VERIFY_WORKER: 'maybe' })).toThrow();
    expect(() => parseWorkerConfig({ VERIFY_LEASE_MS: '5' })).toThrow();
  });

  it('requires the lease to outlast the AI budget by a margin (S2-2)', () => {
    expect(() => parseWorkerConfig({ VERIFY_LEASE_MS: '50000' })).toThrow(/AI_TOTAL_BUDGET_MS/);
    expect(() => parseWorkerConfig({ VERIFY_LEASE_MS: '60000', AI_TOTAL_BUDGET_MS: '40000' })).toThrow();
    expect(parseWorkerConfig({ VERIFY_LEASE_MS: '60000', AI_TOTAL_BUDGET_MS: '30000' }).leaseMs).toBe(60000);
  });
});

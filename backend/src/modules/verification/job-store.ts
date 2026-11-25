import type { JobResult, JobState } from './verification-job.schema.js';

export interface JobRecord {
  activityId: string;
  state: JobState;
  attempts: number;
  nextAttemptAt: Date;
  lockedUntil: Date | null;
  lastErrorCode: string | null;
  /** Set while a decision is stored but its audit entry is not yet written (retry only appends the audit). */
  result?: JobOutcome | null;
}

export type JobOutcome = JobResult;

/**
 * Persistence port of the verification queue. `claim*` are atomic: with several workers (NFR-027) exactly one
 * receives a given due job, and a crashed worker's job becomes claimable again when its lease expires (FR-028).
 */
export interface JobStore {
  /** Idempotent (FR-015, FR-028): returns false when a job for this activity already exists. */
  enqueue(activityId: string, now: Date): Promise<boolean>;
  /** Claims the oldest due job (queued and due, or running with an expired lease); increments attempts. */
  claimDue(now: Date, leaseMs: number): Promise<JobRecord | null>;
  /** Same, for one activity (the immediate attempt). */
  claimOne(activityId: string, now: Date, leaseMs: number): Promise<JobRecord | null>;
  /**
   * The three writes below are fenced on the claim: they apply only while the job is still running with the
   * attempt number the caller claimed. They return false when the lease was lost (another worker took the job),
   * and then change nothing (security review S2-2).
   */
  done(job: JobRecord, result: JobOutcome | null): Promise<boolean>;
  retryAt(job: JobRecord, nextAttemptAt: Date, errorCode: string, result?: JobOutcome | null): Promise<boolean>;
  exhaust(job: JobRecord, errorCode: string): Promise<boolean>;
}

export const JOB_STORE = Symbol('JOB_STORE');

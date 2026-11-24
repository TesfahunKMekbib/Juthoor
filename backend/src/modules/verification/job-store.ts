import type { JobResult, JobState } from './verification-job.schema.js';

export interface JobRecord {
  activityId: string;
  state: JobState;
  attempts: number;
  nextAttemptAt: Date;
  lockedUntil: Date | null;
  lastErrorCode: string | null;
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
  done(activityId: string, result: JobOutcome | null): Promise<void>;
  retryAt(activityId: string, nextAttemptAt: Date, errorCode: string): Promise<void>;
  exhaust(activityId: string, errorCode: string): Promise<void>;
}

export const JOB_STORE = Symbol('JOB_STORE');

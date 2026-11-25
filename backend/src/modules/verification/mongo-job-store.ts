import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, type QueryFilter, Types } from 'mongoose';
import type { JobOutcome, JobRecord, JobStore } from './job-store.js';
import { VerificationJob } from './verification-job.schema.js';

type JobDoc = VerificationJob & { _id: Types.ObjectId };

const toRecord = (j: JobDoc): JobRecord => ({
  activityId: String(j.activityId),
  state: j.state,
  attempts: j.attempts,
  nextAttemptAt: j.nextAttemptAt,
  lockedUntil: j.lockedUntil,
  lastErrorCode: j.lastErrorCode,
  result: j.result ?? null,
});

/** MongoDB queue. Claims use findOneAndUpdate with a lease, so concurrent instances never share a job (NFR-027). */
@Injectable()
export class MongoJobStore implements JobStore {
  constructor(@InjectModel(VerificationJob.name) private readonly jobs: Model<VerificationJob>) {}

  async enqueue(activityId: string, now: Date): Promise<boolean> {
    const res = await this.jobs.updateOne(
      { activityId: new Types.ObjectId(activityId) },
      { $setOnInsert: { state: 'queued', attempts: 0, nextAttemptAt: now, lockedUntil: null, lastErrorCode: null } },
      { upsert: true },
    );
    return res.upsertedCount > 0;
  }

  private claim(filter: QueryFilter<VerificationJob>, now: Date, leaseMs: number): Promise<JobRecord | null> {
    const due: QueryFilter<VerificationJob>[] = [
      { state: 'queued', nextAttemptAt: { $lte: now } },
      { state: 'running', lockedUntil: { $lt: now } },
    ];
    return this.jobs
      .findOneAndUpdate(
        { $and: [filter, { $or: due }] },
        { $set: { state: 'running', lockedUntil: new Date(now.getTime() + leaseMs) }, $inc: { attempts: 1 } },
        { returnDocument: 'after', sort: { nextAttemptAt: 1 } },
      )
      .lean<JobDoc>()
      .then((j) => (j ? toRecord(j) : null));
  }

  claimDue(now: Date, leaseMs: number) {
    return this.claim({}, now, leaseMs);
  }

  claimOne(activityId: string, now: Date, leaseMs: number) {
    return this.claim({ activityId: new Types.ObjectId(activityId) }, now, leaseMs);
  }

  /** Fence: only the worker that still holds the claim (same attempt, still running) may write the outcome. */
  private async fenced(job: JobRecord, set: Record<string, unknown>): Promise<boolean> {
    const res = await this.jobs.updateOne(
      { activityId: new Types.ObjectId(job.activityId), state: 'running', attempts: job.attempts },
      { $set: set },
    );
    return res.matchedCount > 0;
  }

  done(job: JobRecord, result: JobOutcome | null): Promise<boolean> {
    return this.fenced(job, { state: 'done', lockedUntil: null, lastErrorCode: null, result });
  }

  retryAt(job: JobRecord, nextAttemptAt: Date, errorCode: string, result?: JobOutcome | null): Promise<boolean> {
    return this.fenced(job, {
      state: 'queued',
      nextAttemptAt,
      lockedUntil: null,
      lastErrorCode: errorCode,
      ...(result !== undefined ? { result } : {}),
    });
  }

  exhaust(job: JobRecord, errorCode: string): Promise<boolean> {
    return this.fenced(job, { state: 'exhausted', lockedUntil: null, lastErrorCode: errorCode });
  }
}

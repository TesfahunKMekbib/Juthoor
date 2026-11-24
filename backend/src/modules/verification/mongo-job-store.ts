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

  async done(activityId: string, result: JobOutcome | null): Promise<void> {
    await this.jobs.updateOne(
      { activityId: new Types.ObjectId(activityId) },
      { $set: { state: 'done', lockedUntil: null, lastErrorCode: null, result } },
    );
  }

  async retryAt(activityId: string, nextAttemptAt: Date, errorCode: string): Promise<void> {
    await this.jobs.updateOne(
      { activityId: new Types.ObjectId(activityId) },
      { $set: { state: 'queued', nextAttemptAt, lockedUntil: null, lastErrorCode: errorCode } },
    );
  }

  async exhaust(activityId: string, errorCode: string): Promise<void> {
    await this.jobs.updateOne(
      { activityId: new Types.ObjectId(activityId) },
      { $set: { state: 'exhausted', lockedUntil: null, lastErrorCode: errorCode } },
    );
  }
}

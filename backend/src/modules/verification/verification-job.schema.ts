import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Types } from 'mongoose';

export const JOB_STATES = ['queued', 'running', 'done', 'exhausted'] as const;
export type JobState = (typeof JOB_STATES)[number];

@Schema({ _id: false })
export class JobStep {
  @Prop({ type: String }) tag!: string;
  @Prop({ type: String }) modelVersion!: string;
}

/** Codes and numbers only: no photo, text or model output (ADR-0008, FR-025). */
@Schema({ _id: false })
export class JobResult {
  @Prop({ type: Number }) score!: number;
  @Prop({ type: [String], default: [] }) flags!: string[];
  @Prop({ type: String }) outcome!: string;
  /** One entry per executed agent step; lets a retried audit append be rebuilt without re-running the AI (FR-054). */
  @Prop({ type: [SchemaFactory.createForClass(JobStep)], default: [] }) steps!: JobStep[];
  @Prop({ type: String }) providerId!: string;
  @Prop({ type: [String], default: [] }) modelVersions!: string[];
  @Prop({ type: String }) promptVersion!: string;
  @Prop({ type: String }) schemaVersion!: string;
  @Prop({ type: String }) aggregationVersion!: string;
  @Prop({ type: Number }) callCount!: number;
  @Prop({ type: Date }) assessedAt!: Date;
}

/** One verification job per activity (plan section 4). */
@Schema({ collection: 'verificationJobs', timestamps: true })
export class VerificationJob {
  @Prop({ type: Types.ObjectId, required: true }) activityId!: Types.ObjectId;
  @Prop({ type: String, required: true, enum: JOB_STATES, default: 'queued' }) state!: JobState;
  @Prop({ type: Number, default: 0 }) attempts!: number;
  @Prop({ type: Date, required: true }) nextAttemptAt!: Date;
  /** Lease: a running job whose lease has passed can be claimed again (worker crashed). */
  @Prop({ type: Date, default: null }) lockedUntil!: Date | null;
  @Prop({ type: String, default: null }) lastErrorCode!: string | null;
  @Prop({ type: SchemaFactory.createForClass(JobResult), default: null }) result!: JobResult | null;
}

export type VerificationJobDocument = HydratedDocument<VerificationJob>;
export const VerificationJobSchema = SchemaFactory.createForClass(VerificationJob);

// FR-015, FR-028: one job per activity, so duplicate events cannot start a second verification.
VerificationJobSchema.index({ activityId: 1 }, { unique: true });
// FR-028: the sweeper finds due jobs.
VerificationJobSchema.index({ state: 1, nextAttemptAt: 1 });

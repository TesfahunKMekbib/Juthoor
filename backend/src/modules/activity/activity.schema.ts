import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

/** Lifecycle states from ADR-0005 (FR-010, FR-015, FR-026, FR-027, FR-028). `draft` is unused this phase. */
export const ACTIVITY_STATUSES = [
  'draft',
  'submitted',
  'accepted',
  'returned_for_correction',
  'rejected',
  'pending_technical_processing',
] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export const PHOTO_KINDS = ['photo', 'before', 'after', 'receipt'] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

export const EMIRATES = [
  'Abu Dhabi',
  'Dubai',
  'Sharjah',
  'Ajman',
  'Umm Al Quwain',
  'Ras Al Khaimah',
  'Fujairah',
] as const;

/** Emirate and area as read back from the encrypted field; exact coordinates are never stored (ADR-0006). */
export interface ActivityLocation {
  emirate: string;
  area: string;
}

/** AES-256-GCM envelope of the location (NFR-004); see common/crypto/field-cipher.ts. */
@Schema({ _id: false })
export class EncryptedLocation {
  @Prop({ type: Number, required: true }) v!: number;
  @Prop({ type: String, required: true }) iv!: string;
  @Prop({ type: String, required: true }) tag!: string;
  @Prop({ type: String, required: true }) ct!: string;
}

@Schema({ _id: false })
export class ActivityAmount {
  @Prop({ type: Number, required: true }) value!: number;
  @Prop({ type: String, required: true }) unit!: string;
}

/** Details of one photo. The image itself is in GridFS (activityPhotos bucket). */
@Schema({ _id: false })
export class ActivityPhoto {
  @Prop({ type: String, required: true, enum: PHOTO_KINDS }) kind!: string;
  @Prop({ type: Types.ObjectId, required: true }) fileId!: Types.ObjectId;
  @Prop({ type: String }) fileName!: string;
  @Prop({ type: String }) mimeType!: string;
  @Prop({ type: Number }) sizeBytes!: number;
  @Prop({ type: Date, default: () => new Date() }) uploadedAt!: Date;
}

@Schema({ _id: false })
export class StatusChange {
  @Prop({ type: String, default: null }) from!: string | null;
  @Prop({ type: String, required: true }) to!: string;
  @Prop({ type: String, default: null }) reasonCode!: string | null;
  @Prop({ type: Date, default: () => new Date() }) at!: Date;
}

/**
 * One activity a person logged.
 * Same shape as the agreed schema, minus fields this version does not use yet
 * (teamId, programId, groupMemberIds, blurred photo copies, revision).
 */
@Schema({ collection: 'activities', timestamps: true })
export class Activity {
  @Prop({ type: Types.ObjectId, required: true, index: true }) userId!: Types.ObjectId; // ID from User Service
  @Prop({ type: Types.ObjectId, required: true, ref: 'ActivityType' }) activityTypeId!: Types.ObjectId;
  @Prop({ type: Number, required: true }) typeVersion!: number; // rules version used when submitted
  @Prop({ type: String, required: true, maxlength: 500 }) description!: string;
  @Prop({ type: Date, required: true }) doneAt!: Date; // when it happened
  @Prop({ type: SchemaFactory.createForClass(EncryptedLocation), required: true }) locationEnc!: EncryptedLocation;
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) answers!: Record<string, string | number>;
  @Prop({ type: SchemaFactory.createForClass(ActivityAmount), default: null }) amount?: ActivityAmount | null; // null/absent: OTHER without a quantity
  @Prop({ type: [SchemaFactory.createForClass(ActivityPhoto)], default: [] }) photos!: ActivityPhoto[];
  @Prop({ type: String, required: true, enum: ACTIVITY_STATUSES, default: 'submitted' }) status!: ActivityStatus;
  @Prop({ type: String, default: null }) resultReasonCode!: string | null; // status reason code; the app renders the text
  @Prop({ type: String, required: true }) submitKey!: string; // stops double submission
  @Prop({ type: [SchemaFactory.createForClass(StatusChange)], default: [] }) statusHistory!: StatusChange[];
  @Prop({ type: Date, required: true }) submittedAt!: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ActivityDocument = HydratedDocument<Activity>;
export const ActivitySchema = SchemaFactory.createForClass(Activity);

// Submission history for one person, newest first (FR-016)
ActivitySchema.index({ userId: 1, submittedAt: -1 });
// The same submit request can only create one record (FR-015)
ActivitySchema.index({ userId: 1, submitKey: 1 }, { unique: true });
// Used by the checker to find work
ActivitySchema.index({ status: 1, submittedAt: 1 });

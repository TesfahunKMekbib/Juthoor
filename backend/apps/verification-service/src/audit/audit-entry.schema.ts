import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export const AUDIT_ACTIONS = ['verification.decision', 'verification.aiFlag'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

@Schema({ _id: false })
export class AuditStep {
  @Prop({ type: String, required: true }) tag!: string;
  @Prop({ type: String, required: true }) modelVersion!: string;
  @Prop({ type: String, required: true }) providerId!: string;
}

/**
 * Append-only audit record (FR-054, ADR-0008). IDs and codes only: never photo bytes, description,
 * answers, coordinates or model output text. No update/delete API and no TTL index (Q-A6b).
 */
@Schema({ collection: 'auditEntries', timestamps: false, versionKey: false })
export class AuditEntry {
  @Prop({ type: Date, required: true }) at!: Date;
  @Prop({ type: String, required: true, enum: AUDIT_ACTIONS }) action!: AuditAction;
  @Prop({ type: String, required: true }) recordType!: string;
  @Prop({ type: String, required: true }) recordId!: string;
  @Prop({ type: String, required: true }) ruleVersion!: string;
  @Prop({ type: String, required: true }) modelVersion!: string;
  @Prop({ type: String, required: true }) outcome!: string;
  @Prop({ type: Number }) score?: number;
  /** `ai.<flag>` for verification.aiFlag entries. */
  @Prop({ type: String }) flagCode?: string;
  @Prop({ type: String }) providerId?: string;
  @Prop({ type: String }) promptVersion?: string;
  @Prop({ type: String }) schemaVersion?: string;
  @Prop({ type: String }) aggregationVersion?: string;
  @Prop({ type: Number }) callCount?: number;
  @Prop({ type: [SchemaFactory.createForClass(AuditStep)], default: undefined }) steps?: AuditStep[];
  @Prop({ type: String, required: true }) idempotencyKey!: string;
}

export type AuditEntryDocument = HydratedDocument<AuditEntry>;
export const AuditEntrySchema = SchemaFactory.createForClass(AuditEntry);

// FR-054: replayed appends are ignored (unique key).
AuditEntrySchema.index({ idempotencyKey: 1 }, { unique: true });
// FR-055 (later): look up the trail of one record.
AuditEntrySchema.index({ recordId: 1, at: 1 });

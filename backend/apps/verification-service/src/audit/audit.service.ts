import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditEntry, type AuditAction } from './audit-entry.schema.js';

/** Input is a closed set of codes/IDs; unknown properties are dropped on append (ADR-0008). */
export interface AuditEntryInput {
  at: Date;
  action: AuditAction;
  recordType: string;
  recordId: string;
  ruleVersion: string;
  modelVersion: string;
  outcome: string;
  score?: number;
  flagCode?: string;
  providerId?: string;
  promptVersion?: string;
  schemaVersion?: string;
  aggregationVersion?: string;
  callCount?: number;
  steps?: { tag: string; modelVersion: string; providerId: string }[];
  /** Unique per logical event, e.g. `decision:<activityId>` or `flag:<activityId>:<flag>` (FR-054). */
  idempotencyKey: string;
}

export interface AuditRecord extends AuditEntryInput {
  _id?: unknown;
}

/** Append-only: exposes no update or delete (FR-054). */
@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditEntry.name) private readonly model: Model<AuditEntry>) {}

  /** Idempotent: a repeated key is a no-op that returns the first stored entry. */
  async append(input: AuditEntryInput): Promise<{ entry: AuditRecord; created: boolean }> {
    if (!input.idempotencyKey) throw new Error('idempotencyKey is required');
    const doc = pick(input);
    const { idempotencyKey, ...rest } = doc;
    const run = () => this.model.updateOne({ idempotencyKey }, { $setOnInsert: rest }, { upsert: true }).exec();
    let created: boolean;
    try {
      created = (await run()).upsertedCount > 0;
    } catch (err) {
      // Concurrent first writers can both attempt the insert; the loser sees a duplicate key.
      if (!isDuplicateKey(err)) throw err;
      created = false;
    }
    const entry = await this.model.findOne({ idempotencyKey }).lean<AuditRecord>().exec();
    if (!entry) throw new Error('audit entry missing after append');
    return { entry, created };
  }

  async listForRecord(recordId: string): Promise<AuditRecord[]> {
    return this.model.find({ recordId }).sort({ at: 1 }).lean<AuditRecord[]>().exec();
  }
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/** Explicit whitelist so stray properties (e.g. text) can never reach the collection. */
function pick(i: AuditEntryInput): AuditEntryInput {
  const out: AuditEntryInput = {
    at: i.at,
    action: i.action,
    recordType: i.recordType,
    recordId: i.recordId,
    ruleVersion: i.ruleVersion,
    modelVersion: i.modelVersion,
    outcome: i.outcome,
    idempotencyKey: i.idempotencyKey,
  };
  if (i.score !== undefined) out.score = i.score;
  if (i.flagCode !== undefined) out.flagCode = i.flagCode;
  if (i.providerId !== undefined) out.providerId = i.providerId;
  if (i.promptVersion !== undefined) out.promptVersion = i.promptVersion;
  if (i.schemaVersion !== undefined) out.schemaVersion = i.schemaVersion;
  if (i.aggregationVersion !== undefined) out.aggregationVersion = i.aggregationVersion;
  if (i.callCount !== undefined) out.callCount = i.callCount;
  if (i.steps !== undefined) {
    out.steps = i.steps.map((s) => ({ tag: s.tag, modelVersion: s.modelVersion, providerId: s.providerId }));
  }
  return out;
}

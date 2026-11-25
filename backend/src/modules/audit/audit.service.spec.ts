import type { Model } from 'mongoose';
import { AuditEntrySchema, type AuditEntry } from './audit-entry.schema.js';
import { AuditService, type AuditEntryInput } from './audit.service.js';

/** In-memory stand-in honouring the unique idempotencyKey semantics of the real collection. */
function fakeModel(options: { raceOnce?: boolean } = {}): {
  model: Model<AuditEntry>;
  store: Record<string, unknown>[];
} {
  const store: Record<string, unknown>[] = [];
  let raced = false;
  const model = {
    updateOne: (filter: { idempotencyKey: string }, update: { $setOnInsert: Record<string, unknown> }) => ({
      exec: () => {
        if (options.raceOnce && !raced) {
          raced = true;
          store.push({ ...update.$setOnInsert, idempotencyKey: filter.idempotencyKey });
          return Promise.reject(Object.assign(new Error('dup'), { code: 11000 }));
        }
        const exists = store.some((e) => e['idempotencyKey'] === filter.idempotencyKey);
        if (!exists) store.push({ ...update.$setOnInsert, idempotencyKey: filter.idempotencyKey });
        return Promise.resolve({ upsertedCount: exists ? 0 : 1 });
      },
    }),
    findOne: (filter: { idempotencyKey: string }) => ({
      lean: () => ({
        exec: () => Promise.resolve(store.find((e) => e['idempotencyKey'] === filter.idempotencyKey) ?? null),
      }),
    }),
    find: (filter: { recordId: string }) => ({
      sort: () => ({
        lean: () => ({ exec: () => Promise.resolve(store.filter((e) => e['recordId'] === filter.recordId)) }),
      }),
    }),
  } as unknown as Model<AuditEntry>;
  return { model, store };
}

const decision = (over: Partial<AuditEntryInput> = {}): AuditEntryInput => ({
  at: new Date('2026-11-25T10:00:00Z'),
  action: 'verification.decision',
  recordType: 'activity',
  recordId: 'a1',
  ruleVersion: 'rules-1',
  modelVersion: 'mock-1',
  outcome: 'accepted',
  score: 0.85,
  providerId: 'mock',
  promptVersion: 'prompts-v1',
  schemaVersion: 'schema-v1',
  aggregationVersion: 'agg-v1',
  callCount: 2,
  steps: [{ tag: 'evidence', modelVersion: 'mock-1', providerId: 'mock' }],
  idempotencyKey: 'decision:a1',
  ...over,
});

describe('AuditService (FR-054, ADR-0008)', () => {
  it('appends an entry with versions and call count (AC 18, 30)', async () => {
    const { model, store } = fakeModel();
    const r = await new AuditService(model).append(decision());
    expect(r.created).toBe(true);
    expect(store).toHaveLength(1);
    expect(store[0]).toMatchObject({
      providerId: 'mock',
      callCount: 2,
      promptVersion: 'prompts-v1',
      outcome: 'accepted',
    });
  });

  it('ignores a replayed append and returns the first entry (FR-054)', async () => {
    const { model, store } = fakeModel();
    const svc = new AuditService(model);
    await svc.append(decision());
    const again = await svc.append(decision({ outcome: 'rejected', score: 0.1 }));
    expect(again.created).toBe(false);
    expect(again.entry.outcome).toBe('accepted');
    expect(store).toHaveLength(1);
  });

  it('treats a duplicate-key race as a no-op', async () => {
    const { model, store } = fakeModel({ raceOnce: true });
    const r = await new AuditService(model).append(decision());
    expect(r.created).toBe(false);
    expect(store).toHaveLength(1);
  });

  it('rethrows non-duplicate errors', async () => {
    const model = {
      updateOne: () => ({ exec: () => Promise.reject(new Error('db down')) }),
    } as unknown as Model<AuditEntry>;
    await expect(new AuditService(model).append(decision())).rejects.toThrow('db down');
  });

  it('requires an idempotency key', async () => {
    await expect(new AuditService(fakeModel().model).append(decision({ idempotencyKey: '' }))).rejects.toThrow();
  });

  it('keeps one entry per flag and drops unknown properties (no text in the trail, AC 30)', async () => {
    const { model, store } = fakeModel();
    const svc = new AuditService(model);
    await svc.append(
      decision({ action: 'verification.aiFlag', flagCode: 'ai.screenshot', idempotencyKey: 'flag:a1:screenshot' }),
    );
    await svc.append(
      decision({
        action: 'verification.aiFlag',
        flagCode: 'ai.stock_or_watermark',
        idempotencyKey: 'flag:a1:stock',
        ...({ description: 'secret text' } as object),
      }),
    );
    expect(store).toHaveLength(2);
    expect(JSON.stringify(store)).not.toContain('secret text');
    expect(await svc.listForRecord('a1')).toHaveLength(2);
  });

  it('exposes no update or delete and the schema has unique key and no TTL (Q-A6b)', () => {
    const svc = new AuditService(fakeModel().model) as unknown as Record<string, unknown>;
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(svc)).sort()).toEqual([
      'append',
      'constructor',
      'listForRecord',
    ]);
    const indexes = AuditEntrySchema.indexes();
    expect(indexes.some(([f, o]) => f['idempotencyKey'] === 1 && o?.unique === true)).toBe(true);
    expect(indexes.some(([, o]) => o?.expireAfterSeconds !== undefined)).toBe(false);
  });
});

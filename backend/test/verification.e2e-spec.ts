// Slice 2 e2e (plan Q3): submit -> AI verification on the mock provider, over HTTP against a throwaway MongoDB.
//
// How the AI is controlled: the AI and verification modules read process.env at boot and build the model through
// createMultimodalModel(), and @nestjs/testing is not installed, so the provider cannot be overridden in a testing
// module. Instead each app boots with AI_PROVIDER=mock (the real wiring, including the timeout decorator) and the
// test replaces the mock *inside* the TimeoutMultimodalModel with a ControlModel that scripts outcomes
// (fixed score / provider down / malformed) and records every call tag. Everything else is production code.
//
// How the worker is driven: phases A and C run the real VerificationWorker (VERIFY_WORKER=on, VERIFY_POLL_MS=100,
// small backoff) and poll over HTTP with a bounded waitFor. Phase B uses VERIFY_WORKER=off and calls the
// VerificationService (onSubmitted / sweep / runJob) explicitly, so races are exact and not timing dependent.
import type { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import mongoose, { type Connection, Types } from 'mongoose';
import {
  boot,
  closeLeakedConnections,
  DB_NAME,
  getJson,
  type Json,
  KEY,
  makeJpeg,
  MONGODB_URI,
  postActivity,
  setEnv,
  uniq,
  urlOf,
  waitFor,
} from './helpers/e2e.js';

const restoreBase = setEnv({
  UPLOAD_MAX_FILE_MB: '1',
  UPLOAD_MAX_FILES: '6',
  LOCATION_ENCRYPTION_KEY: KEY,
});

const appEnv = (over: Record<string, string | undefined> = {}) => ({
  NODE_ENV: 'development',
  JUTHOOR_DEV_PARTICIPANT: 'true',
  LOCATION_ENCRYPTION_KEY: KEY,
  MONGODB_URI,
  ...over,
});

const DESCRIPTION = 'Zorblax planting description 9f3a';
const SPECIES = 'Zorblaxspecies';
const DECIDED = ['accepted', 'rejected', 'returned_for_correction', 'pending_technical_processing'];

let jpeg: Buffer;
let treeTypeId = '';

const data = (over: Record<string, unknown> = {}) => ({
  activityTypeId: treeTypeId,
  description: DESCRIPTION,
  doneAt: new Date(Date.now() - 3600_000).toISOString(),
  location: { source: 'manual', emirate: 'Dubai', area: 'Zorbtown' },
  answers: { species: SPECIES },
  amount: { value: 2 },
  photoKinds: ['photo'],
  ...over,
});

type ControlMode = 'fixed' | 'down' | 'malformed';
interface Model {
  generate(r: unknown): Promise<unknown>;
}

/** Scripted stand-in for the provider behind the timeout decorator; records tags only, never content. */
class ControlModel {
  mode: ControlMode = 'fixed';
  score = 0.85;
  /** Optional per-request override (returns undefined to fall through to the mode). */
  override: ((tag: string) => unknown) | undefined;
  readonly calls: { requestTag: string; imageCount: number }[] = [];

  constructor(private readonly make: (mode: 'fixed' | 'malformed', score: number) => Model) {}

  async generate(request: { requestTag: string; parts: { type: string }[] }): Promise<unknown> {
    this.calls.push({
      requestTag: request.requestTag,
      imageCount: request.parts.filter((p) => p.type === 'image').length,
    });
    if (this.mode === 'down') {
      const { ModelError } = await import('../libs/integration/ai/multimodal-model.js');
      throw new ModelError('unavailable');
    }
    const forced = this.override?.(request.requestTag);
    if (forced !== undefined) {
      return { json: forced, modelVersion: 'mock-1', providerId: 'mock', usage: { inputTokens: 0, outputTokens: 0 } };
    }
    return this.make(this.mode, this.score).generate(request);
  }

  tags(): string[] {
    return this.calls.map((c) => c.requestTag);
  }

  reset(): void {
    this.mode = 'fixed';
    this.score = 0.85;
    this.override = undefined;
    this.calls.length = 0;
  }
}

interface Harness {
  app: INestApplication;
  base: string;
  conn: Connection;
  model: ControlModel;
  accepted: string[];
  decided: { activityId: string; status: string }[];
}

async function bootHarness(): Promise<Harness> {
  const app = await boot(appEnv());
  const conn = app.get<Connection>(getConnectionToken());
  const { MULTIMODAL_MODEL } = await import('../libs/integration/ai/multimodal-model.js');
  const { MockMultimodalModel } = await import('../libs/integration/ai/mock-multimodal-model.js');
  const model = new ControlModel((mode, score) => new MockMultimodalModel({ mode, score }) as unknown as Model);
  // TimeoutMultimodalModel.inner is TypeScript-private only; swapping it keeps the real timeout decorator.
  (app.get(MULTIMODAL_MODEL) as unknown as { inner: unknown }).inner = model;
  const { EventsService } = await import('../libs/common/events/events.service.js');
  const events = app.get(EventsService);
  const accepted: string[] = [];
  const decided: { activityId: string; status: string }[] = [];
  events.subscribe('ActivityAccepted', (e) => accepted.push(e.activityId));
  events.subscribe('ActivityDecided', (e) => decided.push({ activityId: e.activityId, status: e.status }));
  return { app, base: urlOf(app), conn, model, accepted, decided };
}

async function seed(h: Harness): Promise<void> {
  const { seedActivityTypes } = await import('../src/dev/seed.js');
  await seedActivityTypes(h.app.get(getModelToken('ActivityType')));
  const tree = await h.conn.collection('activityTypes').findOne({ code: 'TREE_PLANTING' });
  treeTypeId = String(tree!._id);
}

const submit = async (h: Harness, over: Record<string, unknown> = {}) => {
  const r = await postActivity(h.base, data(over), [jpeg], uniq());
  expect(r.status).toBe(201);
  return r.body.id as string;
};
const statusOf = async (h: Harness, id: string) => (await getJson(h.base, `/activities/${id}`)).body as Json;
const finalStatus = (h: Harness, id: string, wanted: string[]) =>
  waitFor(
    () => statusOf(h, id),
    (a) => wanted.includes(a.status),
  );
const auditOf = (h: Harness, id: string) => h.conn.collection('auditEntries').find({ recordId: id }).toArray();
const jobsOf = (h: Harness, id: string) =>
  h.conn
    .collection('verificationJobs')
    .find({ activityId: new Types.ObjectId(id) })
    .toArray();

beforeAll(async () => {
  jpeg = await makeJpeg();
});

afterAll(async () => {
  restoreBase();
  // All phases share one random database; drop it with a short-lived connection.
  expect(DB_NAME).toMatch(/^juthoor_e2e_[0-9a-f]{12}$/);
  const c = await mongoose.createConnection(MONGODB_URI).asPromise();
  try {
    await c.dropDatabase();
  } finally {
    await c.close();
  }
});

describe('phase A: real worker, mock provider (AC 14-18, 24, 25, 30)', () => {
  let h: Harness;
  let restore: () => void;
  beforeAll(async () => {
    restore = setEnv({
      AI_PROVIDER: 'mock',
      VERIFY_WORKER: 'on',
      VERIFY_POLL_MS: '100',
      VERIFY_BACKOFF_BASE_MS: '50',
      VERIFY_MAX_ATTEMPTS: '10',
    });
    h = await bootHarness();
    await seed(h);
  }, 60_000);
  afterAll(async () => {
    await h?.app.close();
    restore();
  });
  beforeEach(() => h.model.reset());

  it('accepts a high score, audits once with versions and no personal data, publishes Accepted once (FR-026, FR-054, AC 14-18, 24, 30)', async () => {
    const started = Date.now();
    const id = await submit(h);
    const a = await finalStatus(h, id, DECIDED);
    expect(a.status).toBe('accepted');
    expect(Date.now() - started).toBeLessThan(30_000); // AC 24 (mock only)
    expect(a.resultReasonCode).toBeNull();
    expect(a.acceptedAmount).toEqual({ value: 2, unit: 'trees' });
    expect(a.statusHistory.map((s: Json) => s.to)).toEqual(['submitted', 'accepted']);

    // AC 14: one agent run with the photo and no extra calls.
    expect(h.model.tags()).toEqual(['evidence', 'claim']);
    expect(h.model.calls[0]!.imageCount).toBe(1);

    // AC 18 / 30: exactly one decision entry; no flag entries for a clean result.
    const entries = await auditOf(h, id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'verification.decision',
      recordType: 'activity',
      recordId: id,
      outcome: 'accepted',
      providerId: 'mock',
      modelVersion: 'mock-1',
      callCount: 2,
    });
    for (const f of ['ruleVersion', 'promptVersion', 'schemaVersion', 'aggregationVersion', 'modelVersion']) {
      expect(typeof entries[0]![f]).toBe('string');
      expect(entries[0]![f].length).toBeGreaterThan(0);
    }
    expect(entries[0]!.at).toBeInstanceOf(Date);
    expect(entries[0]!.steps.map((s: Json) => s.tag)).toEqual(['evidence', 'claim']);
    const raw = JSON.stringify(entries);
    for (const secret of [DESCRIPTION, SPECIES, 'Zorbtown', '25.2048', '55.2707', '"lat"', '"lng"', 'coordinates']) {
      expect(raw).not.toContain(secret);
    }

    // AC 17: ActivityAccepted once for this activity; ActivityDecided once.
    expect(h.accepted.filter((x) => x === id)).toHaveLength(1);
    expect(h.decided.filter((x) => x.activityId === id)).toEqual([{ activityId: id, status: 'accepted' }]);
    const jobs = await jobsOf(h, id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.state).toBe('done');
  });

  it('returns a mid score for correction with a reason code and no Accepted event (FR-026, FR-027, AC 15)', async () => {
    h.model.score = 0.5;
    const id = await submit(h);
    const a = await finalStatus(h, id, DECIDED);
    expect(a.status).toBe('returned_for_correction');
    expect(a.resultReasonCode).toBe('verification.evidenceUnclear');
    expect(a.acceptedAmount).toBeNull();
    expect(await auditOf(h, id)).toHaveLength(1);
    expect(h.accepted).not.toContain(id);
    expect(h.decided.filter((x) => x.activityId === id).map((x) => x.status)).toEqual(['returned_for_correction']);
  });

  it('rejects a low score with a reason code and no Accepted event (FR-026, FR-027, AC 15)', async () => {
    h.model.score = 0.1;
    const id = await submit(h);
    const a = await finalStatus(h, id, DECIDED);
    expect(a.status).toBe('rejected');
    expect(a.resultReasonCode).toBe('verification.evidenceUnrelated');
    expect(a.acceptedAmount).toBeNull();
    expect(h.accepted).not.toContain(id);
    expect((await auditOf(h, id)).filter((e) => e.action === 'verification.decision')).toHaveLength(1);
  });

  it('accepts at exactly the accept threshold (FR-026, AC 15)', async () => {
    h.model.score = 0.7;
    const id = await submit(h);
    expect((await finalStatus(h, id, DECIDED)).status).toBe('accepted');
  });

  it('reaches the final status within 30 s of the submit response on the mock provider (AC 24, NFR-002)', async () => {
    const r = await postActivity(h.base, data(), [jpeg], uniq());
    expect(r.status).toBe(201);
    const t0 = Date.now(); // measured from the 201 response
    const a = await waitFor(
      () => statusOf(h, r.body.id),
      (x) => x.status !== 'submitted',
      30_000,
    );
    const elapsedMs = Date.now() - t0;
    expect(a.status).toBe('accepted');
    expect(elapsedMs).toBeLessThanOrEqual(30_000);
  });

  it('parks the activity when the provider is unavailable, then accepts once on retry after recovery (FR-028, AC 16, 17)', async () => {
    h.model.mode = 'down';
    const id = await submit(h);
    const pending = await finalStatus(h, id, ['pending_technical_processing']);
    expect(pending.resultReasonCode).toBe('processing.retrying');
    expect(pending.acceptedAmount).toBeNull();
    expect(await auditOf(h, id)).toHaveLength(0); // technical failure is not a decision: no audit entry
    expect(h.accepted).not.toContain(id);

    h.model.mode = 'fixed'; // provider recovers; the sweeper retries the same job
    const done = await finalStatus(h, id, ['accepted', 'rejected', 'returned_for_correction']);
    expect(done.status).toBe('accepted');
    expect(done.resultReasonCode).toBeNull();
    expect(done.statusHistory.map((s: Json) => s.to)).toEqual([
      'submitted',
      'pending_technical_processing',
      'accepted',
    ]);
    expect((await auditOf(h, id)).filter((e) => e.action === 'verification.decision')).toHaveLength(1);
    expect(h.accepted.filter((x) => x === id)).toHaveLength(1); // no duplicate Accepted on the retry path
    const jobs = await jobsOf(h, id);
    expect(jobs).toHaveLength(1); // no second job
    expect(jobs[0]!.state).toBe('done');
    expect(jobs[0]!.attempts).toBeGreaterThanOrEqual(2);
  });

  it('malformed output gets one repair call and is never accepted while it persists (FR-026, FR-028, AC 25)', async () => {
    h.model.mode = 'malformed';
    const id = await submit(h);
    // Two failed attempts, each = evidence + one evidence.repair call, never reaching the claim step.
    await waitFor(
      async () => h.model.tags().filter((t) => t === 'evidence.repair').length,
      (n) => n >= 2,
    );
    const a = await finalStatus(h, id, ['pending_technical_processing']);
    expect(a.status).toBe('pending_technical_processing');
    expect(a.resultReasonCode).toBe('processing.retrying');
    const tags = h.model.tags();
    expect(tags.every((t) => t === 'evidence' || t === 'evidence.repair')).toBe(true);
    expect(tags.filter((t) => t === 'evidence').length).toBeGreaterThanOrEqual(
      tags.filter((t) => t === 'evidence.repair').length,
    );
    expect(h.accepted).not.toContain(id);
    expect(await auditOf(h, id)).toHaveLength(0);

    h.model.mode = 'fixed'; // leave no retrying job behind for later tests
    expect((await finalStatus(h, id, ['accepted'])).status).toBe('accepted');
  });

  it('never calls the AI when deterministic rules fail, and creates no activity or job (FR-018, AC 14)', async () => {
    const activities = h.conn.collection('activities');
    const jobs = h.conn.collection('verificationJobs');
    const beforeA = await activities.countDocuments();
    const beforeJ = await jobs.countDocuments();
    const bad = [
      data({ doneAt: new Date(Date.now() + 86_400_000).toISOString() }),
      data({ amount: { value: 51 } }),
      data({ location: { source: 'device', coordinates: { lat: 51.5, lng: -0.12 }, area: 'London' } }), // FR-020 deferred
    ];
    for (const d of bad) expect((await postActivity(h.base, d, [jpeg], uniq())).status).toBe(422);
    expect((await postActivity(h.base, data({ photoKinds: [] }), [], uniq())).status).toBe(422);
    // Let at least two sweeps pass (VERIFY_POLL_MS=100) before asserting that nothing happened.
    await new Promise((r) => setTimeout(r, 350));
    expect(h.model.calls).toHaveLength(0);
    expect(await activities.countDocuments()).toBe(beforeA);
    expect(await jobs.countDocuments()).toBe(beforeJ);
  });
});

describe('phase C: retries exhausted (FR-028, Q-E4, AC 16)', () => {
  let h: Harness;
  let restore: () => void;
  beforeAll(async () => {
    restore = setEnv({
      AI_PROVIDER: 'mock',
      VERIFY_WORKER: 'on',
      VERIFY_POLL_MS: '100',
      VERIFY_BACKOFF_BASE_MS: '0',
      VERIFY_MAX_ATTEMPTS: '2',
    });
    h = await bootHarness();
    await seed(h);
  }, 60_000);
  afterAll(async () => {
    await h?.app.close();
    restore();
  });

  it('ends in pending_technical_processing / processing.failedPermanently and stops retrying (FR-028)', async () => {
    h.model.mode = 'down';
    const id = await submit(h);
    const a = await waitFor(
      () => statusOf(h, id),
      (x) => x.resultReasonCode === 'processing.failedPermanently',
    );
    expect(a.status).toBe('pending_technical_processing');
    expect(a.acceptedAmount).toBeNull();
    const job = (await jobsOf(h, id))[0];
    expect(job).toMatchObject({ state: 'exhausted', attempts: 2, lastErrorCode: 'ai.unavailable' });
    expect(h.model.calls).toHaveLength(2);
    await new Promise((r) => setTimeout(r, 350)); // a few sweeps: an exhausted job is not claimed again
    expect(h.model.calls).toHaveLength(2);
    expect((await statusOf(h, id)).status).toBe('pending_technical_processing');
    expect(await auditOf(h, id)).toHaveLength(0);
    expect(h.accepted).not.toContain(id);
  });
});

describe('phase B: explicit driving, duplicate processing and racing sweeps (FR-015, FR-028, FR-054, AC 16-18)', () => {
  let h1: Harness;
  let h2: Harness;
  let restore: () => void;
  beforeAll(async () => {
    restore = setEnv({ AI_PROVIDER: 'mock', VERIFY_WORKER: 'off', VERIFY_BACKOFF_BASE_MS: '0' });
    h1 = await bootHarness();
    h2 = await bootHarness(); // a second instance on the same database (NFR-027)
    await seed(h1);
  }, 60_000);
  afterAll(async () => {
    await h1?.app.close();
    await h2?.app.close();
    restore();
  });
  beforeEach(() => {
    h1.model.reset();
    h2.model.reset();
  });

  const svc = async (h: Harness) => {
    const { VerificationService } = await import('../src/modules/verification/verification.service.js');
    return h.app.get(VerificationService);
  };
  const totalCalls = () => h1.model.calls.length + h2.model.calls.length;
  const acceptedFor = (id: string) => [...h1.accepted, ...h2.accepted].filter((x) => x === id).length;
  const decisions = async (id: string) => (await auditOf(h1, id)).filter((e) => e.action === 'verification.decision');

  it('with the worker off a submission stays submitted until the service is driven', async () => {
    const id = await submit(h1);
    expect((await statusOf(h1, id)).status).toBe('submitted');
    expect(totalCalls()).toBe(0);
    await (await svc(h1)).sweep();
    expect((await statusOf(h1, id)).status).toBe('accepted');
  });

  it('two instances sweeping at once produce one decision, one audit entry, one Accepted (FR-015, FR-028, FR-054)', async () => {
    const id = await submit(h1);
    const [p1, p2] = await Promise.all([(await svc(h1)).sweep(), (await svc(h2)).sweep()]);
    expect(p1 + p2).toBe(1); // exactly one claim of the single job
    expect((await statusOf(h1, id)).status).toBe('accepted');
    expect(await decisions(id)).toHaveLength(1);
    expect(acceptedFor(id)).toBe(1);
    expect(totalCalls()).toBe(2); // one agent run: evidence + claim
    expect(await jobsOf(h1, id)).toHaveLength(1);
  });

  it('concurrent immediate attempts for one event run the agent once (FR-015, FR-028)', async () => {
    const id = await submit(h1);
    const [a, b] = [await svc(h1), await svc(h2)];
    await Promise.all([a.onSubmitted(id), b.onSubmitted(id), a.onSubmitted(id)]);
    expect((await statusOf(h1, id)).status).toBe('accepted');
    expect(totalCalls()).toBe(2);
    expect(await auditOf(h1, id)).toHaveLength(1);
    expect(acceptedFor(id)).toBe(1);
  });

  it('a duplicate run of the same job (lease expiry race) decides and audits once (FR-028, FR-054)', async () => {
    const id = await submit(h1);
    const { JOB_STORE } = await import('../src/modules/verification/job-store.js');
    const store = h1.app.get<{
      enqueue(id: string, now: Date): Promise<boolean>;
      claimOne(id: string, now: Date, leaseMs: number): Promise<unknown>;
    }>(JOB_STORE);
    await store.enqueue(id, new Date());
    // Claimed through the real store (the fenced writes need the genuine attempt number); both runs share the claim.
    const job = (await store.claimOne(id, new Date(), 60_000)) as Parameters<
      Awaited<ReturnType<typeof svc>>['runJob']
    >[0];
    expect(job.attempts).toBe(1);
    const [a, b] = [await svc(h1), await svc(h2)];
    await Promise.all([a.runJob(job), b.runJob(job)]);
    const act = await statusOf(h1, id);
    expect(act.status).toBe('accepted');
    expect(act.statusHistory.map((s: Json) => s.to)).toEqual(['submitted', 'accepted']);
    expect(await decisions(id)).toHaveLength(1);
    expect(acceptedFor(id)).toBe(1);
    expect([...h1.decided, ...h2.decided].filter((d) => d.activityId === id)).toHaveLength(1);
    // Re-running after the decision is a no-op: no AI call, no entry, no event.
    const callsBefore = totalCalls();
    await a.runJob(job);
    expect(totalCalls()).toBe(callsBefore);
    expect(await auditOf(h1, id)).toHaveLength(1);
    expect(acceptedFor(id)).toBe(1);
  });

  it('an AI flag adds exactly one aiFlag audit entry and blocks acceptance (FR-054, AC 28, 30)', async () => {
    h1.model.override = (tag) =>
      tag === 'evidence'
        ? {
            photos: [{ index: 0, relevance: 0.9, quality: 'good', flags: ['screenshot'] }],
            criteriaUnmet: [],
            confidence: 0.95,
          }
        : undefined;
    const id = await submit(h1);
    const s = await svc(h1);
    await s.sweep();
    await s.sweep();
    expect((await statusOf(h1, id)).status).toBe('returned_for_correction'); // hard flag caps at 0.6
    const entries = await auditOf(h1, id);
    expect(entries.filter((e) => e.action === 'verification.decision')).toHaveLength(1);
    const flags = entries.filter((e) => e.action === 'verification.aiFlag');
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ flagCode: 'ai.screenshot', recordId: id });
    expect(h1.accepted).not.toContain(id);
  });
});

describe('provider guard at boot (NFR-009, ADR-0012, AC 32)', () => {
  const vars = {
    LOCATION_ENCRYPTION_KEY: KEY,
    GEMINI_API_KEY: 'fake-key-never-used',
    AI_MODEL: 'fake-model',
    VERIFY_WORKER: 'off',
  };
  const bootEnv = (nodeEnv: string | undefined) => ({
    ...(nodeEnv ? { NODE_ENV: nodeEnv } : {}),
    LOCATION_ENCRYPTION_KEY: KEY,
    MONGODB_URI,
  });

  it('refuses to boot with NODE_ENV=production and AI_PROVIDER=gemini', async () => {
    const restore = setEnv({ ...vars, NODE_ENV: 'production', AI_PROVIDER: 'gemini' });
    try {
      await expect(boot(bootEnv('production'), false)).rejects.toThrow(/AI_PROVIDER/);
    } finally {
      restore();
      await closeLeakedConnections();
    }
  }, 30_000);

  it('refuses to boot with NODE_ENV unset and AI_PROVIDER=gemini', async () => {
    const restore = setEnv({ ...vars, NODE_ENV: undefined, AI_PROVIDER: 'gemini' });
    try {
      await expect(boot(bootEnv(undefined), false)).rejects.toThrow(/AI_PROVIDER/);
    } finally {
      restore();
      await closeLeakedConnections();
    }
  }, 30_000);

  it('boots in production with AI_PROVIDER=mock', async () => {
    const restore = setEnv({ ...vars, NODE_ENV: 'production', AI_PROVIDER: 'mock' });
    let app: INestApplication | undefined;
    try {
      app = await boot(bootEnv('production'));
      expect((await fetch(`${urlOf(app)}api/activity-types`)).status).toBe(200);
    } finally {
      await app?.close();
      restore();
    }
  }, 30_000);

  it('fails config validation for gemini without GEMINI_API_KEY even in development', async () => {
    const restore = setEnv({ ...vars, NODE_ENV: 'development', AI_PROVIDER: 'gemini', GEMINI_API_KEY: undefined });
    try {
      await expect(boot(bootEnv('development'), false)).rejects.toThrow(/GEMINI_API_KEY/);
    } finally {
      restore();
      await closeLeakedConnections();
    }
  }, 30_000);
});

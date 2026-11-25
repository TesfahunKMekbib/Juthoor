// Slice 1 e2e (plan Q1): real Nest app over HTTP against a throwaway MongoDB database.
// Needs MONGODB_URI pointing at a MongoDB server; the database name is replaced by a random one and
// dropped afterwards, so no other database is ever touched. Run: npm run test:e2e
import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { type Connection, mongo, Types } from 'mongoose';
import sharp from 'sharp';

/** HTTP response bodies are untyped JSON; assertions below check their shape explicitly. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- e2e assertions on parsed JSON bodies
type Json = any;

const SERVER_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/x';
const DB_NAME = `juthoor_e2e_${randomBytes(6).toString('hex')}`;
const MONGODB_URI = SERVER_URI.replace(/\/[^/?]*(\?|$)/, `/${DB_NAME}$1`);
const KEY = randomBytes(32).toString('hex');

const baseEnv = (over: Record<string, string | undefined> = {}) => ({
  NODE_ENV: 'development',
  JUTHOOR_DEV_PARTICIPANT: 'true',
  LOCATION_ENCRYPTION_KEY: KEY,
  AI_PROVIDER: 'mock',
  AI_MOCK_MODE: 'fixed',
  MONGODB_URI,
  ...over,
});

// The upload limits are read from process.env when the controller module loads.
process.env.UPLOAD_MAX_FILE_MB = '1';
process.env.UPLOAD_MAX_FILES = '6';
process.env.LOCATION_ENCRYPTION_KEY = KEY;

let app: INestApplication;
let noDevApp: INestApplication;
let base = '';
let noDevBase = '';
let conn: Connection;
let treeTypeId = '';
let draftTypeId = '';
let jpegWithGps: Buffer;

async function boot(env: Record<string, string | undefined>): Promise<INestApplication> {
  const { AppModule } = await import('../src/app.module.js');
  const { ApiExceptionFilter } = await import('../libs/common/errors/http-exception.filter.js');
  const a = await NestFactory.create(await AppModule.forRoot(env), { logger: false });
  a.setGlobalPrefix('api');
  a.useGlobalFilters(new ApiExceptionFilter());
  await a.listen(0, '127.0.0.1');
  return a;
}
const urlOf = (a: INestApplication) => `http://127.0.0.1:${(a.getHttpServer().address() as { port: number }).port}/`;

const validData = (over: Record<string, unknown> = {}) => ({
  activityTypeId: treeTypeId,
  description: 'Planted two ghaf trees',
  doneAt: new Date(Date.now() - 3600_000).toISOString(),
  location: { source: 'manual', emirate: 'Dubai', area: 'Al Barsha' },
  answers: { species: 'Ghaf' },
  amount: { value: 2 },
  photoKinds: ['photo'],
  ...over,
});

interface PhotoSpec {
  buf: Buffer;
  type?: string;
  name?: string;
}
async function post(
  data: unknown,
  photos: PhotoSpec[],
  key: string | undefined,
  target = base,
): Promise<{ status: number; body: Json }> {
  const form = new FormData();
  form.append('data', JSON.stringify(data));
  photos.forEach((p, i) =>
    form.append('photos', new Blob([new Uint8Array(p.buf)], { type: p.type ?? 'image/jpeg' }), p.name ?? `p${i}.jpg`),
  );
  const headers: Record<string, string> = {};
  if (key !== undefined) headers['Idempotency-Key'] = key;
  const res = await fetch(`${target}api/activities`, { method: 'POST', body: form, headers });
  return { status: res.status, body: await res.json() };
}
async function get(path: string, target = base) {
  const res = await fetch(`${target}api${path}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let body: Json;
  try {
    body = JSON.parse(buf.toString('utf8'));
  } catch {
    body = undefined;
  }
  return { status: res.status, body, buf, headers: res.headers };
}
const count = () => conn.collection('activities').countDocuments();
const uniq = () => `key-${randomBytes(6).toString('hex')}`;

beforeAll(async () => {
  app = await boot(baseEnv());
  base = urlOf(app);
  noDevApp = await boot(baseEnv({ NODE_ENV: 'test', JUTHOOR_DEV_PARTICIPANT: undefined }));
  noDevBase = urlOf(noDevApp);
  conn = app.get<Connection>(getConnectionToken());

  const { seedActivityTypes } = await import('../src/dev/seed.js');
  await seedActivityTypes(app.get(getModelToken('ActivityType')));
  const tree = await conn.collection('activityTypes').findOne({ code: 'TREE_PLANTING' });
  treeTypeId = String(tree!._id);
  const draft = await conn
    .collection('activityTypes')
    .insertOne({ ...tree!, _id: new Types.ObjectId(), code: 'DRAFT_ONLY', status: 'draft' });
  draftTypeId = String(draft.insertedId);

  jpegWithGps = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 30, g: 140, b: 60 } } })
    .withExif({
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '25/1 12/1 17/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '55/1 16/1 15/1',
      },
    })
    .jpeg()
    .toBuffer();
}, 60_000);

afterAll(async () => {
  try {
    await conn?.dropDatabase();
  } finally {
    await app?.close();
    await noDevApp?.close();
  }
});

describe('activity types (AC 1)', () => {
  it('lists only published types with their rules (FR-009)', async () => {
    const r = await get('/activity-types');
    expect(r.status).toBe(200);
    const codes = r.body.map((t: Json) => t.code);
    expect(codes).toEqual(expect.arrayContaining(['TREE_PLANTING', 'RECYCLING', 'CLEANUP']));
    expect(codes).not.toContain('DRAFT_ONLY');
    const tree = r.body.find((t: Json) => t.code === 'TREE_PLANTING');
    expect(tree.formFields.length).toBeGreaterThan(0);
    expect(tree.amount).toEqual(expect.objectContaining({ unit: 'trees', min: 1, max: 50 }));
    expect(tree.photoRules).toEqual(expect.objectContaining({ minPhotos: 1, maxPhotos: 4 }));
    expect((await get(`/activity-types/${draftTypeId}`)).status).toBe(404);
  });
});

describe('submission (AC 4, 9, 10, 12)', () => {
  it('creates an activity from multipart with manual location (FR-010, FR-012)', async () => {
    const r = await post(validData(), [{ buf: jpegWithGps }], uniq());
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'submitted', location: { emirate: 'Dubai', area: 'Al Barsha' } });
    expect(r.body.photos).toHaveLength(1);
  });

  it('refuses even an in-UAE device location this phase and creates nothing (FR-020 deferred, FR-012)', async () => {
    const before = await count();
    const r = await post(
      validData({ location: { source: 'device', coordinates: { lat: 25.2048, lng: 55.2708 }, area: 'Downtown' } }),
      [{ buf: jpegWithGps }],
      uniq(),
    );
    expect(r.status).toBe(422);
    expect(r.body.errors).toEqual([
      expect.objectContaining({ field: 'location.source', code: 'location.sourceInvalid' }),
    ]);
    expect(await count()).toBe(before);
  });

  it('repeat submission creates one record (FR-015)', async () => {
    const key = uniq();
    const before = await count();
    const first = await post(validData({ description: 'idem sequential' }), [{ buf: jpegWithGps }], key);
    const second = await post(validData({ description: 'idem sequential' }), [{ buf: jpegWithGps }], key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await count()).toBe(before + 1);
    expect(await conn.collection('activities').countDocuments({ submitKey: key })).toBe(1);
  });

  it('concurrent requests with one key create one record (FR-015)', async () => {
    const key = uniq();
    const rs = await Promise.all(
      [1, 2, 3, 4].map(() => post(validData({ description: 'idem concurrent' }), [{ buf: jpegWithGps }], key)),
    );
    expect(rs.every((r) => r.status === 201 || r.status === 200)).toBe(true);
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(new Set(rs.map((r) => r.body.id)).size).toBe(1);
    expect(await conn.collection('activities').countDocuments({ submitKey: key })).toBe(1);
  });

  it('rejects a missing Idempotency-Key with 400 (FR-015)', async () => {
    const before = await count();
    const r = await post(validData(), [{ buf: jpegWithGps }], undefined);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('request.idempotencyKeyMissing');
    expect(await count()).toBe(before);
  });

  describe('deterministic failures are coded 422 and create nothing (FR-018-021, FR-023)', () => {
    const cases: [string, () => Promise<{ status: number; body: Json }>, string, string][] = [
      [
        'a future date (FR-019)',
        () =>
          post(validData({ doneAt: new Date(Date.now() + 86_400_000).toISOString() }), [{ buf: jpegWithGps }], uniq()),
        'doneAt',
        'doneAt.future',
      ],
      [
        'a device location while GPS validation is deferred (FR-020)',
        () =>
          post(
            validData({ location: { source: 'device', coordinates: { lat: 51.5, lng: -0.12 }, area: 'London' } }),
            [{ buf: jpegWithGps }],
            uniq(),
          ),
        'location.source',
        'location.sourceInvalid',
      ],
      [
        'a text file sent with an image MIME type (FR-021)',
        () =>
          post(
            validData(),
            [{ buf: Buffer.from('<html>not an image</html>'), type: 'image/jpeg', name: 'x.jpg' }],
            uniq(),
          ),
        'photos[0]',
        'photos.typeNotAllowed',
      ],
      [
        'too many photos for the type (FR-021)',
        () =>
          post(
            validData({ photoKinds: ['photo', 'photo', 'photo', 'photo', 'photo'] }),
            Array.from({ length: 5 }, () => ({ buf: jpegWithGps })),
            uniq(),
          ),
        'photos',
        'photos.tooMany',
      ],
      [
        'more files than the upload limit (FR-021)',
        () =>
          post(
            validData(),
            Array.from({ length: 7 }, () => ({ buf: jpegWithGps })),
            uniq(),
          ),
        'photos',
        'photos.tooMany',
      ],
      ['no photo (FR-021)', () => post(validData({ photoKinds: [] }), [], uniq()), 'photos', 'photos.tooFew'],
      [
        'an amount above the maximum (FR-018)',
        () => post(validData({ amount: { value: 51 } }), [{ buf: jpegWithGps }], uniq()),
        'amount.value',
        'amount.outOfRange',
      ],
    ];
    it.each(cases)('rejects %s', async (_n, run, field, code) => {
      const before = await count();
      const r = await run();
      expect(r.status).toBe(422);
      expect(r.body).toMatchObject({ code: 'validation.failed', message: expect.any(String) });
      expect(r.body.errors).toEqual(
        expect.arrayContaining([expect.objectContaining({ field, code, message: expect.any(String) })]),
      );
      expect(await count()).toBe(before);
    });

    it('answers 413 upload.tooLarge for a file above the size limit (FR-021)', async () => {
      const before = await count();
      const big = Buffer.concat([jpegWithGps, Buffer.alloc(Math.round(1.2 * 1024 * 1024))]);
      const r = await post(validData(), [{ buf: big }], uniq());
      expect(r.status).toBe(413);
      expect(r.body.code).toBe('upload.tooLarge');
      expect(await count()).toBe(before);
    });
  });

  it('stores photos without EXIF or GPS (NFR-007, NFR-008)', async () => {
    expect((await sharp(jpegWithGps).metadata()).exif).toBeDefined(); // the fixture really has EXIF
    const r = await post(validData({ description: 'exif check' }), [{ buf: jpegWithGps }], uniq());
    expect(r.status).toBe(201);
    const fileId = new mongo.ObjectId(r.body.photos[0].id);
    const bucket = new mongo.GridFSBucket(conn.db!, { bucketName: 'activityPhotos' });
    const chunks: Buffer[] = [];
    for await (const c of bucket.openDownloadStream(fileId)) chunks.push(Buffer.from(c as Uint8Array));
    const stored = Buffer.concat(chunks);
    const meta = await sharp(stored).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(stored.includes(Buffer.from('GPS'))).toBe(false);
    expect(stored.includes(Buffer.from('Exif'))).toBe(false);
    const viaApi = await get(r.body.photos[0].url.replace(/^\/api/, ''));
    expect(viaApi.status).toBe(200);
    expect((await sharp(viaApi.buf).metadata()).exif).toBeUndefined();
  });

  it('persists no coordinates and encrypts location (NFR-004, NFR-007)', async () => {
    const r = await post(
      validData({
        description: 'crypto check',
        // Stray coordinates on a manual location must be dropped, never stored (NFR-007).
        location: {
          source: 'manual',
          emirate: 'Dubai',
          area: 'Secretville',
          coordinates: { lat: 25.204849, lng: 55.270783 },
        },
      }),
      [{ buf: jpegWithGps }],
      uniq(),
    );
    expect(r.status).toBe(201);
    const raw = await conn.collection('activities').findOne({ _id: new Types.ObjectId(r.body.id) });
    const json = JSON.stringify(raw);
    expect(json).not.toMatch(/25\.2048|55\.2707|"lat"|"lng"|"coordinates"|"latitude"|"longitude"/);
    expect(json).not.toMatch(/Secretville|"Dubai"/);
    expect(Object.keys(raw!.locationEnc).sort()).toEqual(['ct', 'iv', 'tag', 'v']);
    expect(raw).not.toHaveProperty('location');
  });
});

describe('ownership (AC 22)', () => {
  it('lets the owner list and read an activity and its photo (NFR-025)', async () => {
    const created = await post(validData({ description: 'owner read' }), [{ buf: jpegWithGps }], uniq());
    const list = await get('/activities');
    expect(list.status).toBe(200);
    expect(list.body.items.map((a: Json) => a.id)).toContain(created.body.id);
    const detail = await get(`/activities/${created.body.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.id).toBe(created.body.id);
    const photo = await get(created.body.photos[0].url.replace(/^\/api/, ''));
    expect(photo.status).toBe(200);
    expect(photo.headers.get('content-type')).toContain('image/jpeg');
    expect(photo.headers.get('cache-control')).toContain('no-store');
  });

  it("answers 404 for another participant's activity and photo (NFR-009, NFR-025)", async () => {
    // The dev module resolves one fixed participant, so the second participant is a record written
    // straight to MongoDB under a different userId; the dev participant must not see it.
    const mine = await post(validData({ description: 'to copy' }), [{ buf: jpegWithGps }], uniq());
    const otherId = new Types.ObjectId();
    const doc = await conn.collection('activities').findOne({ _id: new Types.ObjectId(mine.body.id) });
    const { _id, ...rest } = doc!;
    const inserted = await conn.collection('activities').insertOne({ ...rest, userId: otherId, submitKey: uniq() });
    const id = String(inserted.insertedId);
    const photoId = String(doc!.photos[0].fileId);

    expect((await get(`/activities/${id}`)).status).toBe(404);
    expect((await get(`/activities/${id}/photos/${photoId}`)).status).toBe(404);
    const list = await get('/activities');
    expect(list.body.items.map((a: Json) => a.id)).not.toContain(id);
    expect((await get(`/activities/${new Types.ObjectId()}/photos/${photoId}`)).status).toBe(404);
    expect((await get('/activities/not-an-id')).status).toBe(404);
  });
});

describe('dev participant guarantees (AC 23)', () => {
  it('answers 401 on participant endpoints without the dev module (ADR-0010)', async () => {
    for (const path of ['/activities', `/activities/${new Types.ObjectId()}`]) {
      const r = await get(path, noDevBase);
      expect(r.status).toBe(401);
      expect(r.body.code).toBe('auth.required');
    }
    const before = await count();
    expect((await post(validData(), [{ buf: jpegWithGps }], uniq(), noDevBase)).status).toBe(401);
    expect(await count()).toBe(before);
    expect((await get('/activity-types', noDevBase)).status).toBe(200); // the catalogue stays public
  });

  it('marks dev responses with the dev header only when enabled (ADR-0010)', async () => {
    expect((await get('/activity-types')).headers.get('x-juthoor-dev-participant')).toBe('true');
    expect((await get('/activity-types', noDevBase)).headers.get('x-juthoor-dev-participant')).toBeNull();
  });

  // main.ts calls exactly these guards before NestFactory.create; calling them avoids needing a build.
  it('refuses to boot with the flag outside development (ADR-0010)', async () => {
    const { assertDevParticipantAllowed } = await import('../libs/common/config/dev-participant-mode.js');
    expect(() => assertDevParticipantAllowed({ NODE_ENV: 'production', JUTHOOR_DEV_PARTICIPANT: 'true' })).toThrow();
    expect(() => assertDevParticipantAllowed({ NODE_ENV: 'test', JUTHOOR_DEV_PARTICIPANT: 'true' })).toThrow();
    expect(() => assertDevParticipantAllowed({ NODE_ENV: 'production' })).not.toThrow();
  });

  it('refuses a real AI provider in production (ADR-0012, NFR-009)', async () => {
    const { assertAiProviderAllowed } = await import('../libs/integration/ai/ai-config.js');
    expect(() => assertAiProviderAllowed({ NODE_ENV: 'production', AI_PROVIDER: 'gemini' })).toThrow();
    expect(() => assertAiProviderAllowed({ NODE_ENV: 'production', AI_PROVIDER: 'mock' })).not.toThrow();
  });
});

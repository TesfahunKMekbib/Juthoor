import { ModelError, type GenerateRequest } from '../multimodal-model.js';
import { claimSchema } from '../../../../src/modules/verification/agent/findings.js';
import { GeminiMultimodalModel, type FetchLike } from './gemini-multimodal-model.js';
import { toGeminiSchema } from './gemini-schema.js';

const KEY = 'SECRET-KEY-123';
const request: GenerateRequest = {
  requestTag: 'claim',
  system: 'sys',
  parts: [
    { type: 'text', text: 'hello' },
    { type: 'image', mimeType: 'image/jpeg', data: new Uint8Array([1, 2, 3]) },
  ],
  responseSchema: claimSchema(),
  maxTokens: 321,
  timeoutMs: 1000,
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const success = {
  candidates: [{ content: { parts: [{ text: '{"a":1}' }] }, finishReason: 'STOP' }],
  modelVersion: 'gemini-x-001',
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 },
};

function model(fetchFn: FetchLike): GeminiMultimodalModel {
  return new GeminiMultimodalModel({ apiKey: KEY, model: 'm-1', fetchFn });
}
const failure = (m: GeminiMultimodalModel): Promise<unknown> => m.generate(request).catch((e: unknown) => e);

describe('GeminiMultimodalModel contract (NFR-023, AC 33)', () => {
  it('sends the key in a header, never in the URL, and maps parts and schema', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const m = model((url, init) => {
      calls.push({ url, init });
      return Promise.resolve(jsonResponse(success));
    });
    await m.generate(request);
    const { url, init } = calls[0]!;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/m-1:generateContent');
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.contents[0].parts[0]).toEqual({ text: 'hello' });
    expect(body.contents[0].parts[1]).toEqual({
      inlineData: { mimeType: 'image/jpeg', data: Buffer.from([1, 2, 3]).toString('base64') },
    });
    expect(body.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      maxOutputTokens: 321,
      temperature: 0,
    });
    expect(body.generationConfig.responseJsonSchema.type).toBe('object');
    expect(body.generationConfig.responseSchema).toBeUndefined();
    expect(body.tools).toBeUndefined();
    expect(init.body as string).not.toContain(KEY);
  });

  it('parses a success response', async () => {
    const r = await model(() => Promise.resolve(jsonResponse(success))).generate(request);
    expect(r).toEqual({
      json: { a: 1 },
      modelVersion: 'gemini-x-001',
      providerId: 'gemini',
      usage: { inputTokens: 10, outputTokens: 4 },
    });
  });

  it('falls back to the configured model id and zero usage', async () => {
    const body = { candidates: [{ content: { parts: [{ text: '{}' }] } }] };
    const r = await model(() => Promise.resolve(jsonResponse(body))).generate(request);
    expect(r.modelVersion).toBe('m-1');
    expect(r.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it.each([429, 500, 503])('maps HTTP %i to a retryable unavailable error', async (status) => {
    const err = await failure(model(() => Promise.resolve(jsonResponse({}, status))));
    expect(err).toBeInstanceOf(ModelError);
    expect(err).toMatchObject({ kind: 'unavailable', retryable: true });
  });

  it.each([
    [401, 'provider.auth'],
    [403, 'provider.auth'],
    [404, 'provider.modelNotFound'],
    [400, 'provider.badRequest'],
    [422, 'provider.http.422'],
  ])('maps HTTP %i to a non-retryable configuration error %s without the key', async (status, code) => {
    const err = (await failure(model(() => Promise.resolve(jsonResponse({}, status))))) as ModelError;
    expect(err).toMatchObject({ kind: 'refused', code, retryable: false });
    expect(err.message).not.toContain(KEY);
  });

  it('maps network failure to retryable unavailable', async () => {
    const err = await failure(model(() => Promise.reject(new TypeError('fetch failed'))));
    expect(err).toMatchObject({ kind: 'unavailable', code: 'provider.network' });
  });

  it('maps a hung request to timeout via AbortController', async () => {
    const m = model(
      (_url, init) =>
        new Promise((_res, rej) => {
          init.signal?.addEventListener('abort', () =>
            rej(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }),
    );
    await expect(m.generate({ ...request, timeoutMs: 20 })).rejects.toMatchObject({ kind: 'timeout', retryable: true });
  });

  it('maps a safety block, empty candidates and non-STOP finish to distinct refused codes', async () => {
    const cases: [unknown, string][] = [
      [{ promptFeedback: { blockReason: 'SAFETY' } }, 'provider.blocked'],
      [{ candidates: [] }, 'provider.noCandidates'],
      [{ candidates: [{ finishReason: 'SAFETY' }] }, 'provider.finishReason'],
    ];
    for (const [body, code] of cases) {
      await expect(model(() => Promise.resolve(jsonResponse(body))).generate(request)).rejects.toMatchObject({
        kind: 'refused',
        code,
        retryable: false,
      });
    }
  });

  it('maps non-JSON model text and a non-JSON body to invalid_output', async () => {
    const text = { candidates: [{ content: { parts: [{ text: 'not json' }] }, finishReason: 'STOP' }] };
    await expect(model(() => Promise.resolve(jsonResponse(text))).generate(request)).rejects.toMatchObject({
      kind: 'invalid_output',
      code: 'provider.nonJson',
    });
    await expect(
      model(() => Promise.resolve(new Response('<html>', { status: 200 }))).generate(request),
    ).rejects.toMatchObject({ kind: 'invalid_output', code: 'provider.badBody' });
  });

  it('rejects an oversized response body as invalid_output (security review S2-6)', async () => {
    const big = 'x'.repeat(1024 * 1024 + 1);
    // streamed body with no content-length: the bounded reader must stop it
    await expect(
      model(() => Promise.resolve(new Response(big, { status: 200 }))).generate(request),
    ).rejects.toMatchObject({ kind: 'invalid_output', code: 'provider.bodyTooLarge' });
    // declared length over the cap is refused before reading
    const declared = new Response('{}', { status: 200, headers: { 'content-length': String(2 * 1024 * 1024) } });
    await expect(model(() => Promise.resolve(declared)).generate(request)).rejects.toMatchObject({
      kind: 'invalid_output',
      code: 'provider.bodyTooLarge',
    });
    // a body exactly at the cap is still read (and fails only as non-JSON)
    const atCap = 'y'.repeat(1024 * 1024);
    await expect(
      model(() => Promise.resolve(new Response(atCap, { status: 200 }))).generate(request),
    ).rejects.toMatchObject({ code: 'provider.badBody' });
    // a body-less response is a bad body, not a crash
    await expect(
      model(() => Promise.resolve(new Response(null, { status: 200 }))).generate(request),
    ).rejects.toMatchObject({ code: 'provider.badBody' });
  });

  it('supports an overridable base URL and defaults to global fetch', async () => {
    let seen = '';
    const m = new GeminiMultimodalModel({
      apiKey: KEY,
      model: 'm',
      baseUrl: 'http://fake.test/v1',
      fetchFn: (url) => {
        seen = url;
        return Promise.resolve(jsonResponse(success));
      },
    });
    await m.generate(request);
    expect(seen).toBe('http://fake.test/v1/models/m:generateContent');
    expect(new GeminiMultimodalModel({ apiKey: KEY, model: 'm' })).toBeDefined();
  });
});

describe('toGeminiSchema', () => {
  it('translates every node type and drops empty enums', () => {
    expect(
      toGeminiSchema({
        type: 'object',
        required: ['a'],
        properties: {
          a: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 2 }, minItems: 1, maxItems: 2 },
          b: { type: 'boolean' },
          c: { type: 'string', enum: [] },
          d: { type: 'string', enum: ['x'] },
          e: { type: 'number', minimum: 0, maximum: 1 },
          f: { type: 'array', items: { type: 'boolean' } },
        },
      }),
    ).toEqual({
      type: 'object',
      required: ['a'],
      properties: {
        a: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 2 }, minItems: 1, maxItems: 2 },
        b: { type: 'boolean' },
        c: { type: 'string' },
        d: { type: 'string', enum: ['x'] },
        e: { type: 'number', minimum: 0, maximum: 1 },
        f: { type: 'array', items: { type: 'boolean' } },
      },
    });
  });
});

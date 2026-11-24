import { assertAiProviderAllowed, createMultimodalModel, parseAiConfig } from './ai-config.js';
import { AiConfigError } from './env.js';
import { MockMultimodalModel } from './mock-multimodal-model.js';
import { ModelError, type GenerateRequest, type MultimodalModel } from './multimodal-model.js';
import { TimeoutMultimodalModel } from './with-timeout.js';

const req = (requestTag: GenerateRequest['requestTag'], timeoutMs = 50): GenerateRequest => ({
  requestTag,
  system: 's',
  parts: [
    { type: 'text', text: 't' },
    { type: 'image', mimeType: 'image/jpeg', data: new Uint8Array(1) },
    { type: 'image', mimeType: 'image/jpeg', data: new Uint8Array(1) },
  ],
  responseSchema: { type: 'boolean' },
  maxTokens: 10,
  timeoutMs,
});

describe('production guard (NFR-009, ADR-0012, AC 32)', () => {
  it('fails for a real provider in production', () => {
    expect(() => assertAiProviderAllowed({ NODE_ENV: 'production', AI_PROVIDER: 'gemini' })).toThrow(AiConfigError);
  });
  it('fails for an unknown provider in production', () => {
    expect(() => assertAiProviderAllowed({ NODE_ENV: 'production', AI_PROVIDER: 'MOCK' })).toThrow(AiConfigError);
  });
  it('allows mock (explicit or default) in production', () => {
    expect(() => assertAiProviderAllowed({ NODE_ENV: 'production', AI_PROVIDER: 'mock' })).not.toThrow();
    expect(() => assertAiProviderAllowed({ NODE_ENV: 'production' })).not.toThrow();
  });
  it('allows a real provider only in development or test', () => {
    expect(() => assertAiProviderAllowed({ NODE_ENV: 'development', AI_PROVIDER: 'gemini' })).not.toThrow();
    expect(() => assertAiProviderAllowed({ NODE_ENV: 'test', AI_PROVIDER: 'gemini' })).not.toThrow();
  });
  it('fails for a real provider when NODE_ENV is unset or another value (S1)', () => {
    expect(() => assertAiProviderAllowed({ AI_PROVIDER: 'gemini' })).toThrow(AiConfigError);
    expect(() => assertAiProviderAllowed({ NODE_ENV: 'staging', AI_PROVIDER: 'gemini' })).toThrow(AiConfigError);
  });
  it('allows mock with NODE_ENV unset', () => {
    expect(() => assertAiProviderAllowed({})).not.toThrow();
  });
});

describe('parseAiConfig (AC 32)', () => {
  it('uses documented defaults', () => {
    expect(parseAiConfig({})).toMatchObject({
      provider: 'mock',
      mockMode: 'fixed',
      maxCalls: 5,
      totalBudgetMs: 24000,
      minCallMs: 3000,
      followupBelow: 0.5,
      imageMaxPx: 1024,
      maxOutputTokens: 800,
      timeoutMs: 20000,
    });
  });
  it('rejects unknown provider, bad mock mode and out-of-range numbers', () => {
    expect(() => parseAiConfig({ AI_PROVIDER: 'openai' })).toThrow(AiConfigError);
    expect(() => parseAiConfig({ AI_MOCK_MODE: 'chaos' })).toThrow(AiConfigError);
    expect(() => parseAiConfig({ AI_FOLLOWUP_BELOW: '1.1' })).toThrow(AiConfigError);
    expect(() => parseAiConfig({ AI_MAX_CALLS: '2.5' })).toThrow(AiConfigError);
    expect(() => parseAiConfig({ AI_TIMEOUT_MS: 'abc' })).toThrow(AiConfigError);
    expect(() => parseAiConfig({ AI_MAX_CALLS: '0' })).toThrow(AiConfigError);
  });
  it('requires GEMINI_API_KEY and AI_MODEL for gemini', () => {
    expect(() => parseAiConfig({ AI_PROVIDER: 'gemini' })).toThrow(AiConfigError);
    expect(() => parseAiConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' })).toThrow(AiConfigError);
    expect(parseAiConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', AI_MODEL: 'm' }).provider).toBe('gemini');
  });
});

describe('createMultimodalModel', () => {
  it('builds the mock for AI_PROVIDER=mock', async () => {
    const model = createMultimodalModel(parseAiConfig({ AI_MOCK_MODE: 'unavailable' }));
    await expect(model.generate(req('evidence'))).rejects.toMatchObject({ kind: 'unavailable' });
  });
  it('builds the gemini adapter when configured (B7c)', () => {
    const cfg = parseAiConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', AI_MODEL: 'm' });
    expect(createMultimodalModel(cfg)).toBeDefined();
  });
  it('rejects a gemini config without key or model', () => {
    const cfg = parseAiConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', AI_MODEL: 'm' });
    expect(() => createMultimodalModel({ ...cfg, model: undefined })).toThrow(AiConfigError);
  });
});

describe('MockMultimodalModel', () => {
  it('fixed mode returns one finding per image', async () => {
    const mock = new MockMultimodalModel({ score: 0.6 });
    const r = await mock.generate(req('evidence'));
    expect(r.providerId).toBe('mock');
    expect((r.json as { photos: unknown[] }).photos).toHaveLength(2);
    expect(mock.calls).toEqual([{ requestTag: 'evidence', imageCount: 2 }]);
  });
  it('fixed mode answers claim, followup and repair tags', async () => {
    const mock = new MockMultimodalModel();
    expect(((await mock.generate(req('claim'))).json as { amountPlausible: string }).amountPlausible).toBe('yes');
    expect((await mock.generate(req('followup'))).json).toEqual({ answers: [], confidence: 0.95 });
    expect((await mock.generate(req('claim.repair'))).json).toHaveProperty('descriptionMatches');
  });
  it('malformed mode returns schema-invalid output', async () => {
    const r = await new MockMultimodalModel({ mode: 'malformed' }).generate(req('claim'));
    expect(r.json).toEqual({ malformed: true });
  });
  it('scripted mode replays per tag in order, errors and then runs dry', async () => {
    const mock = new MockMultimodalModel({
      mode: 'scripted',
      script: { evidence: [{ json: { a: 1 } }, { error: 'refused' }], claim: [{ json: { b: 2 } }] },
    });
    expect((await mock.generate(req('evidence'))).json).toEqual({ a: 1 });
    await expect(mock.generate(req('evidence'))).rejects.toMatchObject({ kind: 'refused' });
    expect((await mock.generate(req('claim'))).json).toEqual({ b: 2 });
    await expect(mock.generate(req('claim'))).rejects.toBeInstanceOf(ModelError);
  });
});

describe('TimeoutMultimodalModel (NFR-002, FR-028)', () => {
  it('maps a hanging call to a timeout ModelError', async () => {
    const mock = new MockMultimodalModel({ mode: 'scripted', script: { evidence: [{ hang: true }] } });
    await expect(new TimeoutMultimodalModel(mock).generate(req('evidence', 10))).rejects.toMatchObject({
      kind: 'timeout',
    });
  });
  it('passes through results and ModelErrors, and wraps unknown errors as unavailable', async () => {
    const ok = new TimeoutMultimodalModel(new MockMultimodalModel());
    expect((await ok.generate(req('claim'))).modelVersion).toBe('mock-1');
    const refused = new TimeoutMultimodalModel(
      new MockMultimodalModel({ mode: 'scripted', script: { claim: [{ error: 'refused' }] } }),
    );
    await expect(refused.generate(req('claim'))).rejects.toMatchObject({ kind: 'refused' });
    const broken: MultimodalModel = { generate: () => Promise.reject(new Error('boom with secret')) };
    const err = await new TimeoutMultimodalModel(broken).generate(req('claim')).catch((e: unknown) => e);
    expect(err).toMatchObject({ kind: 'unavailable' });
    expect((err as Error).message).not.toContain('secret');
  });
});

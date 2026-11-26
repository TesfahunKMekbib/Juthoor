import type { ImagePreparer } from '../../../../libs/integration/ai/image-prep.js';
import { MockMultimodalModel, type ScriptEntry } from '../../../../libs/integration/ai/mock-multimodal-model.js';
import { AgentTechnicalError, VerificationAgent, type AgentConfig } from './verification-agent.js';
import type { AgentInput } from './prompts/index.js';

const config: AgentConfig = {
  maxCalls: 5,
  totalBudgetMs: 24000,
  minCallMs: 3000,
  perCallTimeoutMs: 20000,
  followupBelow: 0.5,
  imageMaxPx: 800,
  maxImages: 6,
  maxOutputTokens: 700,
};
const evidence = {
  photos: [{ index: 0, relevance: 0.9, quality: 'good', flags: [] }],
  criteriaUnmet: [],
  confidence: 0.9,
};
const claim = {
  amountPlausible: 'yes',
  beforeAfter: 'n_a',
  descriptionMatches: 'yes',
  dateContext: 'yes',
  confidence: 0.9,
};
const input: AgentInput = {
  type: { code: 'TREE_PLANTING', category: 'planting', criteria: [], requiresBeforeAfter: false },
  photos: [{ kind: 'photo', mimeType: 'image/png', data: new Uint8Array([1]) }],
  description: 'd',
  answers: [],
  amount: { value: 1, unit: 'trees' },
  doneAtDate: '2026-11-24',
  emirate: 'Dubai',
};
const prep: ImagePreparer = {
  prepare: (photos) => Promise.resolve(photos.map(() => ({ mimeType: 'image/jpeg', data: new Uint8Array([7]) }))),
};
const ok = (json: unknown): ScriptEntry => ({ json });
const unavailable: ScriptEntry = { error: 'unavailable' };

function setup(script: Record<string, ScriptEntry[]>, over: Partial<AgentConfig> = {}, clock?: { t: number }) {
  const mock = new MockMultimodalModel({ mode: 'scripted', script });
  const sleeps: number[] = [];
  const state = clock ?? { t: 0 };
  const agent = new VerificationAgent(
    mock,
    prep,
    { ...config, ...over },
    () => state.t,
    (ms) => {
      sleeps.push(ms);
      state.t += ms;
      return Promise.resolve();
    },
    () => 0.5,
  );
  return { mock, agent, sleeps };
}

describe('transient model failures are retried inside one attempt (NFR-002)', () => {
  it('503 then success decides within the same attempt, with a 800-1600 ms backoff and the call counted', async () => {
    const { agent, mock, sleeps } = setup({ evidence: [unavailable, ok(evidence)], claim: [ok(claim)] });
    const r = await agent.assess(input);
    expect(mock.calls.map((c) => c.requestTag)).toEqual(['evidence', 'evidence', 'claim']);
    expect(sleeps).toEqual([1200]);
    expect(r.callCount).toBe(3);
  });

  it('three 503s in a row fail the attempt as before (retryable)', async () => {
    const { agent, mock } = setup({ evidence: [unavailable, unavailable, unavailable] });
    await expect(agent.assess(input)).rejects.toMatchObject({ code: 'ai.unavailable', retryable: true });
    expect(mock.calls).toHaveLength(3);
  });

  it.each(['timeout', 'refused'] as const)('does not retry %s', async (kind) => {
    const { agent, mock, sleeps } = setup({ evidence: [{ error: kind }, ok(evidence)] });
    await expect(agent.assess(input)).rejects.toBeInstanceOf(AgentTechnicalError);
    expect(mock.calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('does not retry invalid output here (only the existing single repair)', async () => {
    const { agent, mock, sleeps } = setup({
      evidence: [{ error: 'invalid_output' }],
      'evidence.repair': [{ error: 'invalid_output' }],
    });
    await expect(agent.assess(input)).rejects.toMatchObject({ code: 'ai.invalidOutput' });
    expect(mock.calls.map((c) => c.requestTag)).toEqual(['evidence', 'evidence.repair']);
    expect(sleeps).toEqual([]);
  });

  it('stops retrying when the remaining budget cannot afford a call plus the backoff', async () => {
    const clock = { t: 0 };
    const { agent, mock, sleeps } = setup({ evidence: [unavailable, ok(evidence)] }, { totalBudgetMs: 3500 }, clock);
    await expect(agent.assess(input)).rejects.toMatchObject({ code: 'ai.unavailable' });
    expect(mock.calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('respects AI_MAX_CALLS: retries count toward it', async () => {
    const { agent, mock } = setup({ evidence: [unavailable, unavailable, ok(evidence)] }, { maxCalls: 2 });
    await expect(agent.assess(input)).rejects.toMatchObject({ code: 'ai.unavailable' });
    expect(mock.calls).toHaveLength(2);
  });
});

import { AiConfigError, readNumber, type Env } from './env.js';
import { GeminiMultimodalModel } from './gemini/gemini-multimodal-model.js';
import { MockMultimodalModel, type MockMode } from './mock-multimodal-model.js';
import type { MultimodalModel } from './multimodal-model.js';
import { TimeoutMultimodalModel } from './with-timeout.js';

export const AI_PROVIDERS = ['mock', 'gemini'] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];
const MOCK_MODES: readonly MockMode[] = ['fixed', 'scripted', 'unavailable', 'malformed'];

export interface AiConfig {
  provider: AiProviderName;
  mockMode: MockMode;
  mockScore: number;
  model: string | undefined;
  /** Never log or echo. */
  geminiApiKey: string | undefined;
  timeoutMs: number;
  maxCalls: number;
  totalBudgetMs: number;
  minCallMs: number;
  followupBelow: number;
  imageMaxPx: number;
  maxOutputTokens: number;
}

function providerOf(env: Env): string {
  return env['AI_PROVIDER']?.trim() || 'mock';
}

/**
 * Real-provider guard (ADR-0012 section 10, NFR-009, AC 32; owner decision "dev-only"): a provider other than
 * mock runs only when NODE_ENV is exactly "development" or "test". Unset, staging and production fail.
 * Call from main.ts before the app listens.
 */
export function assertAiProviderAllowed(env: Env): void {
  const provider = providerOf(env);
  const devOnly = env['NODE_ENV'] === 'development' || env['NODE_ENV'] === 'test';
  if (provider !== 'mock' && !devOnly) {
    throw new AiConfigError(
      'AI_PROVIDER must be "mock" unless NODE_ENV is "development" or "test" (privacy review required, ADR-0012)',
    );
  }
}

/** Parses and validates AI_* variables at boot (unknown provider, bad numbers throw AiConfigError). */
export function parseAiConfig(env: Env): AiConfig {
  const provider = providerOf(env);
  if (!(AI_PROVIDERS as readonly string[]).includes(provider)) {
    throw new AiConfigError(`AI_PROVIDER "${provider}" is not supported (use ${AI_PROVIDERS.join(' | ')})`);
  }
  const mockMode = (env['AI_MOCK_MODE']?.trim() || 'fixed') as MockMode;
  if (!MOCK_MODES.includes(mockMode)) {
    throw new AiConfigError(`AI_MOCK_MODE must be one of ${MOCK_MODES.join(' | ')}`);
  }
  const model = env['AI_MODEL']?.trim() || undefined;
  const geminiApiKey = env['GEMINI_API_KEY']?.trim() || undefined;
  if (provider === 'gemini' && (!geminiApiKey || !model)) {
    throw new AiConfigError('AI_PROVIDER=gemini requires GEMINI_API_KEY and AI_MODEL');
  }
  return {
    provider: provider as AiProviderName,
    mockMode,
    mockScore: readNumber(env, 'AI_MOCK_SCORE', 0.85, { min: 0, max: 1 }),
    model,
    geminiApiKey,
    timeoutMs: readNumber(env, 'AI_TIMEOUT_MS', 20000, { min: 1, integer: true }),
    maxCalls: readNumber(env, 'AI_MAX_CALLS', 5, { min: 1, max: 20, integer: true }),
    totalBudgetMs: readNumber(env, 'AI_TOTAL_BUDGET_MS', 24000, { min: 1, integer: true }),
    minCallMs: readNumber(env, 'AI_MIN_CALL_MS', 3000, { min: 0, integer: true }),
    followupBelow: readNumber(env, 'AI_FOLLOWUP_BELOW', 0.5, { min: 0, max: 1 }),
    imageMaxPx: readNumber(env, 'AI_IMAGE_MAX_PX', 1024, { min: 64, max: 4096, integer: true }),
    maxOutputTokens: readNumber(env, 'AI_MAX_OUTPUT_TOKENS', 800, { min: 1, integer: true }),
  };
}

/** Provider factory (NFR-023). Every model is wrapped with the timeout guard. */
export function createMultimodalModel(config: AiConfig): MultimodalModel {
  switch (config.provider) {
    case 'mock':
      return new TimeoutMultimodalModel(new MockMultimodalModel({ mode: config.mockMode, score: config.mockScore }));
    case 'gemini':
      if (!config.geminiApiKey || !config.model)
        throw new AiConfigError('AI_PROVIDER=gemini requires GEMINI_API_KEY and AI_MODEL');
      return new TimeoutMultimodalModel(
        new GeminiMultimodalModel({ apiKey: config.geminiApiKey, model: config.model }),
      );
  }
}

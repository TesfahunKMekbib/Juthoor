import {
  ModelError,
  type AgentStep,
  type GenerateRequest,
  type GenerateResult,
  type ModelErrorKind,
  type MultimodalModel,
} from './multimodal-model.js';

export type MockMode = 'fixed' | 'scripted' | 'unavailable' | 'malformed';

/** One scripted reply for a request tag. `hang` never resolves (exercises timeouts). */
export type ScriptEntry = { json: unknown } | { error: ModelErrorKind } | { hang: true };

export interface MockOptions {
  mode?: MockMode;
  /** `fixed` mode: findings aggregate to this score (AI_MOCK_SCORE). Default 0.85. */
  score?: number;
  /** `scripted` mode: queued replies per request tag (e.g. `evidence`, `evidence.repair`). */
  script?: Partial<Record<string, ScriptEntry[]>>;
}

export const MOCK_PROVIDER_ID = 'mock';
export const MOCK_MODEL_VERSION = 'mock-1';

/** Deterministic, offline model for tests and the demo (ADR-0012 section 8). Records tags only, never content. */
export class MockMultimodalModel implements MultimodalModel {
  readonly calls: { requestTag: string; imageCount: number }[] = [];
  private readonly mode: MockMode;
  private readonly score: number;
  private readonly script: Map<string, ScriptEntry[]>;

  constructor(options: MockOptions = {}) {
    this.mode = options.mode ?? 'fixed';
    this.score = options.score ?? 0.85;
    this.script = new Map(Object.entries(options.script ?? {}).map(([k, v]) => [k, [...(v ?? [])]]));
  }

  generate(request: GenerateRequest): Promise<GenerateResult> {
    const imageCount = request.parts.filter((p) => p.type === 'image').length;
    this.calls.push({ requestTag: request.requestTag, imageCount });

    switch (this.mode) {
      case 'unavailable':
        return Promise.reject(new ModelError('unavailable'));
      case 'malformed':
        return Promise.resolve(this.result({ malformed: true }));
      case 'scripted': {
        const entry = this.script.get(request.requestTag)?.shift();
        if (!entry) return Promise.reject(new ModelError('unavailable', `no scripted reply for ${request.requestTag}`));
        if ('error' in entry) return Promise.reject(new ModelError(entry.error));
        if ('hang' in entry) return new Promise<GenerateResult>(() => undefined);
        return Promise.resolve(this.result(entry.json));
      }
      case 'fixed':
        return Promise.resolve(
          this.result(this.fixedFindings(request.requestTag.split('.')[0] as AgentStep, imageCount)),
        );
    }
  }

  private fixedFindings(step: AgentStep, imageCount: number): unknown {
    switch (step) {
      case 'evidence':
        return {
          photos: Array.from({ length: imageCount }, (_, index) => ({
            index,
            relevance: this.score,
            quality: 'good',
            flags: [],
          })),
          criteriaUnmet: [],
          confidence: 0.95,
        };
      case 'claim':
        return {
          amountPlausible: 'yes',
          beforeAfter: 'n_a',
          descriptionMatches: 'yes',
          dateContext: 'yes',
          confidence: 0.95,
        };
      case 'followup':
        return { answers: [], confidence: 0.95 };
    }
  }

  private result(json: unknown): GenerateResult {
    return {
      json,
      modelVersion: MOCK_MODEL_VERSION,
      providerId: MOCK_PROVIDER_ID,
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }
}

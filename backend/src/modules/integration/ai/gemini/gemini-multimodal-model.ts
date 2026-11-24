import {
  ModelError,
  type GenerateRequest,
  type GenerateResult,
  type ModelPart,
  type MultimodalModel,
} from '../multimodal-model.js';
import { toGeminiSchema } from './gemini-schema.js';

export const GEMINI_PROVIDER_ID = 'gemini';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface GeminiOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  /** Injectable for tests; defaults to Node's global fetch. */
  fetchFn?: FetchLike;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

/**
 * Gemini REST field names (checked against the generateContent API reference on 2026-11-25) are built
 * only in `buildBody`; response field names are read only in `interpret`.
 */
function toGeminiPart(part: ModelPart): Record<string, unknown> {
  return part.type === 'text'
    ? { text: part.text }
    : { inlineData: { mimeType: part.mimeType, data: Buffer.from(part.data).toString('base64') } };
}

export function buildBody(request: GenerateRequest): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: [{ role: 'user', parts: request.parts.map(toGeminiPart) }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: toGeminiSchema(request.responseSchema),
      maxOutputTokens: request.maxTokens,
      temperature: 0,
    },
  };
}

/** Gemini REST adapter (ADR-0012, NFR-023). Dev-only: production boot is blocked by assertAiProviderAllowed. */
export class GeminiMultimodalModel implements MultimodalModel {
  private readonly fetchFn: FetchLike;
  private readonly baseUrl: string;

  constructor(private readonly options: GeminiOptions) {
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(0, request.timeoutMs));
    try {
      const url = `${this.baseUrl}/models/${encodeURIComponent(this.options.model)}:generateContent`;
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.options.apiKey },
          body: JSON.stringify(buildBody(request)),
          signal: controller.signal,
        });
      } catch (err) {
        // Messages never include the request (key, content): only a kind.
        if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          throw new ModelError('timeout');
        }
        throw new ModelError('unavailable', undefined, 'provider.network');
      }
      this.assertStatus(response.status);
      let payload: GeminiResponse;
      try {
        payload = (await response.json()) as GeminiResponse;
      } catch {
        if (controller.signal.aborted) throw new ModelError('timeout');
        throw new ModelError('invalid_output', undefined, 'provider.badBody');
      }
      return this.interpret(payload);
    } finally {
      clearTimeout(timer);
    }
  }

  private assertStatus(status: number): void {
    if (status >= 200 && status < 300) return;
    if (status === 429 || status >= 500) throw new ModelError('unavailable', undefined, `provider.http.${status}`);
    // 400/401/403 and other 4xx: configuration or credential problem, not transient.
    throw new ModelError('refused', undefined, 'provider.auth');
  }

  private interpret(payload: GeminiResponse): GenerateResult {
    if (payload.promptFeedback?.blockReason) throw new ModelError('refused', undefined, 'provider.blocked');
    const candidate = payload.candidates?.[0];
    if (!candidate) throw new ModelError('refused', undefined, 'provider.noCandidates');
    if (candidate.finishReason !== undefined && candidate.finishReason !== 'STOP') {
      throw new ModelError('refused', undefined, 'provider.finishReason');
    }
    const text = (candidate.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ModelError('invalid_output', undefined, 'provider.nonJson');
    }
    return {
      json,
      modelVersion: payload.modelVersion ?? this.options.model,
      providerId: GEMINI_PROVIDER_ID,
      usage: {
        inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }
}

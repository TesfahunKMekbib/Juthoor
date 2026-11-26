import {
  ModelError,
  type GenerateRequest,
  type GenerateResult,
  type ModelPart,
  type MultimodalModel,
} from '../multimodal-model.js';
import { toGeminiSchema } from './gemini-schema.js';

export const GEMINI_PROVIDER_ID = 'gemini';
/** Largest response body accepted from the provider (security review S2-6). */
export const MAX_RESPONSE_BYTES = 1024 * 1024;
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

/** Reads the body as text, refusing more than MAX_RESPONSE_BYTES (declared or streamed). */
async function readBounded(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new ModelError('invalid_output', undefined, 'provider.bodyTooLarge');
  }
  if (!response.body) throw new Error('no body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new ModelError('invalid_output', undefined, 'provider.bodyTooLarge');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
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
        payload = JSON.parse(await readBounded(response)) as GeminiResponse;
      } catch (err) {
        if (err instanceof ModelError) throw err;
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
    // Other 4xx: configuration problems, not transient (not retried). Distinct codes so operators can tell a bad
    // key from a retired/unknown AI_MODEL (Gemini answers 404) or a malformed request.
    if (status === 401 || status === 403) throw new ModelError('refused', undefined, 'provider.auth');
    if (status === 404) throw new ModelError('refused', undefined, 'provider.modelNotFound');
    if (status === 400) throw new ModelError('refused', undefined, 'provider.badRequest');
    throw new ModelError('refused', undefined, `provider.http.${status}`);
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

/**
 * Provider-independent multimodal model port (ADR-0012, NFR-023, FR-025).
 * Adapters (mock, later Gemini) implement it; domain code never touches a provider SDK.
 */

/** Small JSON-schema subset used for model output (enums and numbers only, no free text, FR-025). */
export type ResponseSchema =
  | { type: 'object'; properties: Record<string, ResponseSchema>; required: readonly string[] }
  | { type: 'array'; items: ResponseSchema; minItems?: number; maxItems?: number }
  | { type: 'number'; minimum: number; maximum: number }
  | { type: 'integer'; minimum: number; maximum: number }
  | { type: 'string'; enum: readonly string[] }
  | { type: 'boolean' };

export type AgentStep = 'evidence' | 'claim' | 'followup';
/** A repair call re-asks one step after invalid output. */
export type RequestTag = AgentStep | `${AgentStep}.repair`;

export type ModelPart = { type: 'text'; text: string } | { type: 'image'; mimeType: string; data: Uint8Array };

export interface GenerateRequest {
  requestTag: RequestTag;
  system: string;
  parts: readonly ModelPart[];
  responseSchema: ResponseSchema;
  maxTokens: number;
  timeoutMs: number;
}

export interface GenerateResult {
  json: unknown;
  modelVersion: string;
  providerId: string;
  usage: { inputTokens: number; outputTokens: number };
}

export type ModelErrorKind = 'unavailable' | 'timeout' | 'refused' | 'invalid_output';

/** Typed failure. Any kind is a technical failure, never a decision (FR-028). Message holds no content. */
export class ModelError extends Error {
  constructor(
    readonly kind: ModelErrorKind,
    message?: string,
  ) {
    super(message ?? `model error: ${kind}`);
    this.name = 'ModelError';
  }
}

export interface MultimodalModel {
  generate(request: GenerateRequest): Promise<GenerateResult>;
}

/** Nest injection token. */
export const MULTIMODAL_MODEL = Symbol('MULTIMODAL_MODEL');

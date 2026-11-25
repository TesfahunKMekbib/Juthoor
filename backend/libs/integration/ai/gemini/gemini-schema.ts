import type { ResponseSchema } from '../multimodal-model.js';

/**
 * Translates our ResponseSchema into standard JSON Schema for Gemini's
 * `generationConfig.responseJsonSchema` (the field the Gemini API docs recommend over the legacy
 * OpenAPI-subset `responseSchema`; checked against the API reference on 2026-11-25).
 * The agent's own validator (schema-validator.ts) re-checks every response, so the model's
 * constrained decoding is a convenience, not a trust boundary.
 */
export type GeminiJsonSchema =
  | { type: 'object'; properties: Record<string, GeminiJsonSchema>; required: string[] }
  | { type: 'array'; items: GeminiJsonSchema; minItems?: number; maxItems?: number }
  | { type: 'number' | 'integer'; minimum: number; maximum: number }
  | { type: 'string'; enum?: string[] }
  | { type: 'boolean' };

export function toGeminiSchema(schema: ResponseSchema): GeminiJsonSchema {
  switch (schema.type) {
    case 'object':
      return {
        type: 'object',
        properties: Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)])),
        required: [...schema.required],
      };
    case 'array':
      return {
        type: 'array',
        items: toGeminiSchema(schema.items),
        ...(schema.minItems !== undefined ? { minItems: schema.minItems } : {}),
        ...(schema.maxItems !== undefined ? { maxItems: schema.maxItems } : {}),
      };
    case 'number':
    case 'integer':
      return { type: schema.type, minimum: schema.minimum, maximum: schema.maximum };
    case 'string':
      // An empty enum is invalid JSON Schema; a plain string is safe because our validator enforces the enum.
      return schema.enum.length > 0 ? { type: 'string', enum: [...schema.enum] } : { type: 'string' };
    case 'boolean':
      return { type: 'boolean' };
  }
}

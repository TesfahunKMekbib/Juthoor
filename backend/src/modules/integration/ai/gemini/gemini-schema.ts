import type { ResponseSchema } from '../multimodal-model.js';

/**
 * UNSURE-FIELD ISOLATION: everything about Gemini's schema dialect lives here.
 * Assumptions to verify against the live API: upper-case `type` names, `format: 'enum'` for string enums,
 * `minimum`/`maximum` on NUMBER/INTEGER, `minItems`/`maxItems` on ARRAY, `required` on OBJECT.
 * The agent's own validator (schema-validator.ts) re-checks every response, so a looser dialect is safe.
 */
export type GeminiSchema = {
  type: 'OBJECT' | 'ARRAY' | 'NUMBER' | 'INTEGER' | 'STRING' | 'BOOLEAN';
  format?: 'enum';
  enum?: string[];
  properties?: Record<string, GeminiSchema>;
  required?: string[];
  items?: GeminiSchema;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
};

export function toGeminiSchema(schema: ResponseSchema): GeminiSchema {
  switch (schema.type) {
    case 'object':
      return {
        type: 'OBJECT',
        properties: Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)])),
        required: [...schema.required],
      };
    case 'array':
      return {
        type: 'ARRAY',
        items: toGeminiSchema(schema.items),
        ...(schema.minItems !== undefined ? { minItems: schema.minItems } : {}),
        ...(schema.maxItems !== undefined ? { maxItems: schema.maxItems } : {}),
      };
    case 'number':
      return { type: 'NUMBER', minimum: schema.minimum, maximum: schema.maximum };
    case 'integer':
      return { type: 'INTEGER', minimum: schema.minimum, maximum: schema.maximum };
    case 'string':
      // An empty enum is rejected by the API; plain STRING is safe because our validator enforces the enum.
      return schema.enum.length > 0 ? { type: 'STRING', format: 'enum', enum: [...schema.enum] } : { type: 'STRING' };
    case 'boolean':
      return { type: 'BOOLEAN' };
  }
}

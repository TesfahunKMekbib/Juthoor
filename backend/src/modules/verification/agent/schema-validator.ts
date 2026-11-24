import type { ResponseSchema } from '../../integration/ai/multimodal-model.js';

export type ValidationResult = { ok: true; value: unknown } | { ok: false; errors: string[] };

const MAX_ERRORS = 20;

/**
 * Pure validator for the schema subset used by the agent (ADR-0012 section 4).
 * Unknown object keys are rejected so the model cannot smuggle free text or a decision field (FR-025).
 * Errors are `path:code` strings only; they never echo the offending value (safe for repair prompts and logs).
 */
export function validateAgainstSchema(schema: ResponseSchema, value: unknown): ValidationResult {
  const errors: string[] = [];
  check(schema, value, '$', errors);
  return errors.length === 0 ? { ok: true, value } : { ok: false, errors: errors.slice(0, MAX_ERRORS) };
}

function check(schema: ResponseSchema, value: unknown, path: string, errors: string[]): void {
  if (errors.length >= MAX_ERRORS) return;
  switch (schema.type) {
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path}:type`);
      return;
    case 'string':
      if (typeof value !== 'string') errors.push(`${path}:type`);
      else if (!schema.enum.includes(value)) errors.push(`${path}:enum`);
      return;
    case 'number':
    case 'integer':
      if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`${path}:type`);
      else if (schema.type === 'integer' && !Number.isInteger(value)) errors.push(`${path}:integer`);
      else if (value < schema.minimum || value > schema.maximum) errors.push(`${path}:range`);
      return;
    case 'array': {
      if (!Array.isArray(value)) {
        errors.push(`${path}:type`);
        return;
      }
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}:minItems`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push(`${path}:maxItems`);
        return;
      }
      value.forEach((item, i) => check(schema.items, item, `${path}[${i}]`, errors));
      return;
    }
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        errors.push(`${path}:type`);
        return;
      }
      const record = value as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        if (!(key in schema.properties)) errors.push(`${path}.${key}:unexpected`);
      }
      for (const key of schema.required) {
        if (!(key in record)) errors.push(`${path}.${key}:missing`);
      }
      for (const [key, sub] of Object.entries(schema.properties)) {
        if (key in record) check(sub, record[key], `${path}.${key}`, errors);
      }
      return;
    }
  }
}

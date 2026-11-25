/** Tiny pure helpers for validated numeric env values (shared by AI and verification config). */
export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiConfigError';
  }
}

export type Env = Readonly<Record<string, string | undefined>>;

export interface NumberRule {
  min?: number;
  max?: number;
  integer?: boolean;
}

export function readNumber(env: Env, key: string, fallback: number, rule: NumberRule = {}): number {
  const raw = env[key]?.trim();
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new AiConfigError(`${key} must be a number`);
  if (rule.integer && !Number.isInteger(n)) throw new AiConfigError(`${key} must be an integer`);
  if (rule.min !== undefined && n < rule.min) throw new AiConfigError(`${key} must be >= ${rule.min}`);
  if (rule.max !== undefined && n > rule.max) throw new AiConfigError(`${key} must be <= ${rule.max}`);
  return n;
}

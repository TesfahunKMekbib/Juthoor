import { readNumber, type Env } from '../integration/ai/env.js';
import { validateThresholds, type Thresholds } from './decide-outcome.js';
import type { RetryConfig } from './retry-policy.js';

export interface VerificationConfig {
  thresholds: Thresholds;
  retry: RetryConfig;
  pollMs: number;
}

/** Boot-time validation of AI_ACCEPT/REJECT_THRESHOLD and VERIFY_* (plan section 4). Throws on invalid values. */
export function parseVerificationConfig(env: Env): VerificationConfig {
  const thresholds: Thresholds = {
    accept: readNumber(env, 'AI_ACCEPT_THRESHOLD', 0.7, { min: 0, max: 1 }),
    reject: readNumber(env, 'AI_REJECT_THRESHOLD', 0.3, { min: 0, max: 1 }),
  };
  validateThresholds(thresholds);
  return {
    thresholds,
    retry: {
      maxAttempts: readNumber(env, 'VERIFY_MAX_ATTEMPTS', 5, { min: 1, max: 20, integer: true }),
      backoffBaseMs: readNumber(env, 'VERIFY_BACKOFF_BASE_MS', 30000, { min: 0, integer: true }),
    },
    pollMs: readNumber(env, 'VERIFY_POLL_MS', 2000, { min: 100, integer: true }),
  };
}

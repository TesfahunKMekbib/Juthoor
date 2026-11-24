import { AiConfigError, readNumber, type Env } from '../integration/ai/env.js';
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

export interface WorkerConfig {
  /** VERIFY_WORKER=off disables the background worker (e.g. API-only instances or tests). Default on. */
  enabled: boolean;
  /** Lease on a claimed job; must exceed AI_TOTAL_BUDGET_MS (NFR-027, FR-028). */
  leaseMs: number;
  /** Max jobs one sweep processes. */
  batchSize: number;
}

export function parseWorkerConfig(env: Env): WorkerConfig {
  const flag = (env['VERIFY_WORKER']?.trim() || 'on').toLowerCase();
  if (flag !== 'on' && flag !== 'off') throw new AiConfigError('VERIFY_WORKER must be "on" or "off"');
  return {
    enabled: flag === 'on',
    leaseMs: readNumber(env, 'VERIFY_LEASE_MS', 60000, { min: 1000, integer: true }),
    batchSize: readNumber(env, 'VERIFY_BATCH_SIZE', 5, { min: 1, max: 100, integer: true }),
  };
}

/** Pure retry policy for technical failures (Q-E4, FR-028). */
export interface RetryConfig {
  maxAttempts: number;
  backoffBaseMs: number;
}

export type RetryDecision =
  | {
      action: 'retry';
      delayMs: number;
      nextAttemptAt: Date;
      reasonCode: 'processing.retrying';
    }
  | { action: 'exhausted'; reasonCode: 'processing.failedPermanently' };

/**
 * `attempt` = number of attempts already made (1-based, the one that just failed).
 * Retry delay = backoffBaseMs * 2^(attempt-1); at `attempt >= maxAttempts` the job is exhausted.
 */
export function retryPolicy(attempt: number, config: RetryConfig, now: Date): RetryDecision {
  if (!Number.isInteger(config.maxAttempts) || config.maxAttempts < 1) throw new RangeError('maxAttempts must be >= 1');
  if (!Number.isFinite(config.backoffBaseMs) || config.backoffBaseMs < 0)
    throw new RangeError('backoffBaseMs must be >= 0');
  if (!Number.isInteger(attempt) || attempt < 1) throw new RangeError('attempt must be a positive integer');
  if (attempt >= config.maxAttempts) return { action: 'exhausted', reasonCode: 'processing.failedPermanently' };
  const delayMs = config.backoffBaseMs * 2 ** (attempt - 1);
  return {
    action: 'retry',
    delayMs,
    nextAttemptAt: new Date(now.getTime() + delayMs),
    reasonCode: 'processing.retrying',
  };
}

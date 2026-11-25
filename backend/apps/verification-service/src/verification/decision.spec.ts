import { decideOutcome, validateThresholds, ThresholdError } from './decide-outcome.js';
import { retryPolicy } from './retry-policy.js';
import { parseVerificationConfig } from './verification-config.js';
import { AiConfigError } from '../../../../libs/integration/ai/env.js';

const t = { accept: 0.7, reject: 0.3 };

describe('decideOutcome (Q-E2, FR-026, FR-027, AC 15)', () => {
  it.each([
    [1, 'accepted', null],
    [0.7, 'accepted', null],
    [0.6999, 'returned_for_correction', 'verification.evidenceUnclear'],
    [0.3, 'returned_for_correction', 'verification.evidenceUnclear'],
    [0.2999, 'rejected', 'verification.evidenceUnrelated'],
    [0, 'rejected', 'verification.evidenceUnrelated'],
  ])('score %p maps to %s', (score, status, reasonCode) => {
    expect(decideOutcome(score, t)).toEqual({ status, reasonCode });
  });

  it('never accepts an invalid score (malformed output safety)', () => {
    for (const bad of [NaN, Infinity, -0.1, 1.01]) expect(() => decideOutcome(bad, t)).toThrow(RangeError);
  });

  it('validates thresholds: accept > reject, both in [0,1]', () => {
    expect(() => validateThresholds({ accept: 0.5, reject: 0.5 })).toThrow(ThresholdError);
    expect(() => validateThresholds({ accept: 0.3, reject: 0.7 })).toThrow(ThresholdError);
    expect(() => validateThresholds({ accept: 1.1, reject: 0.3 })).toThrow(ThresholdError);
    expect(() => validateThresholds({ accept: 0.7, reject: -0.1 })).toThrow(ThresholdError);
    expect(() => validateThresholds({ accept: NaN, reject: 0.1 })).toThrow(ThresholdError);
    expect(() => validateThresholds({ accept: 1, reject: 0 })).not.toThrow();
    expect(() => decideOutcome(0.9, { accept: 0.2, reject: 0.8 })).toThrow(ThresholdError);
  });
});

describe('retryPolicy (Q-E4, FR-028, AC 16)', () => {
  const cfg = { maxAttempts: 5, backoffBaseMs: 30000 };
  const now = new Date('2026-11-25T10:00:00.000Z');

  it('backs off exponentially from the base', () => {
    const delays = [1, 2, 3, 4].map((a) => {
      const d = retryPolicy(a, cfg, now);
      return d.action === 'retry' ? d.delayMs : -1;
    });
    expect(delays).toEqual([30000, 60000, 120000, 240000]);
    const first = retryPolicy(1, cfg, now);
    expect(first).toMatchObject({ action: 'retry', reasonCode: 'processing.retrying' });
    if (first.action === 'retry') expect(first.nextAttemptAt.toISOString()).toBe('2026-11-25T10:00:30.000Z');
  });

  it('is exhausted exactly at the maximum attempt (boundary)', () => {
    expect(retryPolicy(4, cfg, now).action).toBe('retry');
    expect(retryPolicy(5, cfg, now)).toEqual({ action: 'exhausted', reasonCode: 'processing.failedPermanently' });
    expect(retryPolicy(6, cfg, now).action).toBe('exhausted');
  });

  it('with one allowed attempt the first failure exhausts', () => {
    expect(retryPolicy(1, { maxAttempts: 1, backoffBaseMs: 10 }, now).action).toBe('exhausted');
  });

  it('rejects invalid input', () => {
    expect(() => retryPolicy(0, cfg, now)).toThrow(RangeError);
    expect(() => retryPolicy(1.5, cfg, now)).toThrow(RangeError);
    expect(() => retryPolicy(1, { maxAttempts: 0, backoffBaseMs: 1 }, now)).toThrow(RangeError);
    expect(() => retryPolicy(1, { maxAttempts: 3, backoffBaseMs: -1 }, now)).toThrow(RangeError);
  });
});

describe('parseVerificationConfig', () => {
  it('uses plan defaults', () => {
    expect(parseVerificationConfig({})).toEqual({
      thresholds: { accept: 0.7, reject: 0.3 },
      retry: { maxAttempts: 5, backoffBaseMs: 30000 },
      pollMs: 2000,
    });
  });
  it('fails on inverted thresholds or bad numbers', () => {
    expect(() => parseVerificationConfig({ AI_ACCEPT_THRESHOLD: '0.2', AI_REJECT_THRESHOLD: '0.5' })).toThrow(
      ThresholdError,
    );
    expect(() => parseVerificationConfig({ AI_ACCEPT_THRESHOLD: '2' })).toThrow(AiConfigError);
    expect(() => parseVerificationConfig({ VERIFY_MAX_ATTEMPTS: '0' })).toThrow(AiConfigError);
  });
});

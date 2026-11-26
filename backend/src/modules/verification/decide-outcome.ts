/** Pure outcome mapping (Q-E2, FR-026, FR-027). Status names follow ADR-0005. */
export type DecidedStatus = 'accepted' | 'returned_for_correction' | 'rejected';

export interface Thresholds {
  /** score >= accept: Accepted (equality included, FR-026). */
  accept: number;
  /** reject <= score < accept: Returned for Correction; below: Rejected. */
  reject: number;
}

export interface Outcome {
  status: DecidedStatus;
  /** Status reason code (plan section 1); null when accepted. */
  reasonCode: string | null;
}

/**
 * Aggregate reason code to status reason code, highest priority first (FR-027). Stored codes of older records
 * (verification.evidenceUnclear, verification.evidenceUnrelated) stay valid as the fallbacks.
 */
const REASON_PRIORITY: readonly (readonly [string, string])[] = [
  ['evidence.hardFlag', 'verification.suspectedManipulation'],
  ['evidence.unrelatedScene', 'verification.unrelatedScene'],
  ['claim.notEnvironmental', 'verification.notEnvironmental'],
  ['claim.beforeAfterInconsistent', 'verification.beforeAfterInconsistent'],
  ['claim.descriptionMismatch', 'verification.descriptionMismatch'],
  ['claim.amountImplausible', 'verification.amountImplausible'],
  ['claim.dateImplausible', 'verification.dateImplausible'],
  ['evidence.criteriaUnmet', 'verification.criteriaUnmet'],
  ['evidence.lowRelevance', 'verification.lowRelevance'],
  ['evidence.lowConfidence', 'verification.lowConfidence'],
];

/** Pure: the most specific status reason code for a non-accepted outcome, or the given fallback. */
export function specificReasonCode(reasonCodes: readonly string[], fallback: string): string {
  for (const [code, reason] of REASON_PRIORITY) if (reasonCodes.includes(code)) return reason;
  return fallback;
}

export class ThresholdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ThresholdError';
  }
}

const inUnit = (n: number): boolean => Number.isFinite(n) && n >= 0 && n <= 1;

/** Boot validation: both in [0,1] and accept > reject. Throws ThresholdError. */
export function validateThresholds(t: Thresholds): void {
  if (!inUnit(t.accept) || !inUnit(t.reject)) throw new ThresholdError('thresholds must be within [0,1]');
  if (!(t.accept > t.reject)) throw new ThresholdError('accept threshold must be greater than reject threshold');
}

/**
 * score and thresholds to an outcome. An invalid score (NaN, out of range) throws, so it can never be
 * turned into an acceptance; callers treat that as a technical failure (FR-028).
 */
export function decideOutcome(score: number, thresholds: Thresholds, reasonCodes: readonly string[] = []): Outcome {
  validateThresholds(thresholds);
  if (!inUnit(score)) throw new RangeError('score must be within [0,1]');
  if (score >= thresholds.accept) return { status: 'accepted', reasonCode: null };
  if (score >= thresholds.reject)
    return {
      status: 'returned_for_correction',
      reasonCode: specificReasonCode(reasonCodes, 'verification.evidenceUnclear'),
    };
  return { status: 'rejected', reasonCode: specificReasonCode(reasonCodes, 'verification.evidenceUnrelated') };
}

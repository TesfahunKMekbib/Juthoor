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
  reasonCode: 'verification.evidenceUnclear' | 'verification.evidenceUnrelated' | null;
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
export function decideOutcome(score: number, thresholds: Thresholds): Outcome {
  validateThresholds(thresholds);
  if (!inUnit(score)) throw new RangeError('score must be within [0,1]');
  if (score >= thresholds.accept) return { status: 'accepted', reasonCode: null };
  if (score >= thresholds.reject)
    return { status: 'returned_for_correction', reasonCode: 'verification.evidenceUnclear' };
  return { status: 'rejected', reasonCode: 'verification.evidenceUnrelated' };
}

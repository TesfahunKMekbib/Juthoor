import type { ClaimFindings, EvidenceFindings, FollowupFindings, IssueCode, PhotoFlag, Verdict } from './findings.js';

/** Bump when any weight, cap or rule below changes (recorded in audit, FR-054). Calibrate with the real provider (Q-C3). */
export const AGGREGATION_VERSION = 'agg-v4';

/** Flags that always cap the score below the default accept threshold (ADR-0012 section 3). */
export const HARD_FLAGS: readonly PhotoFlag[] = [
  'screenshot',
  'stock_or_watermark',
  'ai_generated',
  'embedded_instructions',
];
export const HARD_FLAG_CAP = 0.6;
export const LOW_CONFIDENCE_CAP = 0.65;
/** Every photo shows an unrelated scene: lands in Rejected under default thresholds. */
export const UNRELATED_CAP = 0.2;

const QUALITY_FACTOR = { good: 1, fair: 0.85, poor: 0.6 } as const;
const CLAIM_NO_FACTOR = 0.5;
const CLAIM_UNCLEAR_FACTOR = 0.9;
/** Share of the score an entirely unmet criteria list removes (one unmet of one halves it). */
const CRITERIA_UNMET_WEIGHT = 0.5;
/** For these claim fields the photos often cannot show the answer, so "unclear" is neutral. */
const UNCLEAR_IS_NEUTRAL: ReadonlySet<string> = new Set(['amount', 'date', 'environmental']);
const FOLLOWUP_NO_CEIL = 0.25;
const SEVERITY: Record<Verdict, number> = { yes: 0, unclear: 1, no: 2 };
const CONFLICT_HIGH = 0.7;
const CONFLICT_LOW = 0.3;

export interface AggregateInput {
  evidence: EvidenceFindings;
  claim: ClaimFindings;
  followup?: FollowupFindings | undefined;
  /** Number of evidence criteria listed for the activity type. */
  criteriaCount: number;
  followupBelow: number;
}

export interface AggregateResult {
  score: number;
  /** Model flags observed (e.g. `screenshot`), deduplicated and sorted; `people_visible` is recorded only. */
  flags: PhotoFlag[];
  /** Coded reasons for audit/UI; codes only. */
  reasonCodes: string[];
  aggregationVersion: string;
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000;
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

interface Effective {
  relevance: number;
  claim: Record<'amount' | 'beforeAfter' | 'description' | 'date' | 'environmental', Verdict | 'n_a'>;
  confidence: number;
}

function meanRelevance(evidence: EvidenceFindings): number {
  if (evidence.photos.length === 0) return 0;
  const total = evidence.photos.reduce((sum, p) => sum + p.relevance * QUALITY_FACTOR[p.quality], 0);
  return total / evidence.photos.length;
}

/** Quality-weighted mean relevance across photos (0..1). Empty photo list scores 0. */
export function evidenceScoreOf(evidence: EvidenceFindings): number {
  return meanRelevance(evidence);
}

const ISSUE_FIELD = {
  amount: 'amount',
  before_after: 'beforeAfter',
  description: 'description',
  date: 'date',
} as const;

function resolve(input: AggregateInput): Effective {
  const { evidence, claim, followup } = input;
  let relevance = meanRelevance(evidence);
  const merged: Effective['claim'] = {
    amount: claim.amountPlausible,
    beforeAfter: claim.beforeAfter,
    description: claim.descriptionMatches,
    date: claim.dateContext,
    environmental: claim.environmental ?? 'n_a',
  };
  let confidence = Math.min(evidence.confidence, claim.confidence);
  if (followup) {
    // Follow-up can only make the result worse (monotone non-increasing): a "yes" never raises relevance or
    // repairs a claim, so injected text cannot buy an accept through it (security review S2-1, ADR-0012 3.3).
    for (const { issue, verdict } of followup.answers) {
      if (issue === 'photo_relevance') {
        if (verdict === 'no') relevance = Math.min(relevance, FOLLOWUP_NO_CEIL);
      } else {
        const key = ISSUE_FIELD[issue];
        const current = merged[key];
        if (current !== 'n_a' && SEVERITY[verdict] > SEVERITY[current]) merged[key] = verdict;
      }
    }
    confidence = Math.min(confidence, followup.confidence);
  }
  return { relevance, claim: merged, confidence };
}

/** Pure: findings to score 0..1, flags and reason codes. The model never supplies a decision (FR-025/026). */
export function aggregate(input: AggregateInput): AggregateResult {
  const result = aggregateOnce(input);
  if (!input.followup) return result;
  // Belt and braces: the follow-up result can never exceed the score without it.
  const baseline = aggregateOnce({ ...input, followup: undefined });
  return { ...result, score: Math.min(result.score, baseline.score) };
}

function aggregateOnce(input: AggregateInput): AggregateResult {
  const { evidence } = input;
  const eff = resolve(input);
  const reasonCodes: string[] = [];

  let score = eff.relevance;
  if (eff.relevance < 0.5) reasonCodes.push('evidence.lowRelevance');

  const unmet = new Set(evidence.criteriaUnmet).size;
  if (input.criteriaCount > 0 && unmet > 0) {
    score *= clamp01(1 - CRITERIA_UNMET_WEIGHT * (unmet / input.criteriaCount));
    reasonCodes.push('evidence.criteriaUnmet');
    // Half or more of the criteria unmet can never be accepted, whatever the photo relevance says.
    if (unmet / input.criteriaCount >= 0.5) score = Math.min(score, LOW_CONFIDENCE_CAP);
  }

  const claimCodes: Record<keyof Effective['claim'], string> = {
    amount: 'claim.amountImplausible',
    beforeAfter: 'claim.beforeAfterInconsistent',
    description: 'claim.descriptionMismatch',
    date: 'claim.dateImplausible',
    environmental: 'claim.notEnvironmental',
  };
  for (const key of Object.keys(eff.claim) as (keyof Effective['claim'])[]) {
    const v = eff.claim[key];
    if (v === 'no') {
      score *= CLAIM_NO_FACTOR;
      reasonCodes.push(claimCodes[key]);
    } else if (v === 'unclear' && !UNCLEAR_IS_NEUTRAL.has(key)) {
      score *= CLAIM_UNCLEAR_FACTOR;
    }
  }

  const flags = [...new Set(evidence.photos.flatMap((p) => p.flags))].sort() as PhotoFlag[];
  if (flags.some((f) => HARD_FLAGS.includes(f))) {
    score = Math.min(score, HARD_FLAG_CAP);
    reasonCodes.push('evidence.hardFlag');
  }
  if (evidence.photos.length > 0 && evidence.photos.every((p) => p.flags.includes('unrelated_scene'))) {
    score = Math.min(score, UNRELATED_CAP);
    reasonCodes.push('evidence.unrelatedScene');
  }
  if (eff.confidence < input.followupBelow) {
    score = Math.min(score, LOW_CONFIDENCE_CAP);
    reasonCodes.push('evidence.lowConfidence');
  }

  return { score: round4(clamp01(score)), flags, reasonCodes, aggregationVersion: AGGREGATION_VERSION };
}

export interface FollowupDecision {
  trigger: boolean;
  reason: 'low_confidence' | 'conflict' | null;
  /** Issue codes the follow-up may ask about (never free text). */
  issues: IssueCode[];
}

/**
 * Follow-up predicate (AC 26): only when a confidence is below `followupBelow`, or evidence and claim
 * disagree. Never triggers when there is nothing to ask.
 */
export function followupTrigger(
  evidence: EvidenceFindings,
  claim: ClaimFindings,
  followupBelow: number,
): FollowupDecision {
  const relevance = meanRelevance(evidence);
  const claimVerdicts: Verdict[] = [claim.amountPlausible, claim.descriptionMatches, claim.dateContext];
  if (claim.beforeAfter !== 'n_a') claimVerdicts.push(claim.beforeAfter);
  const claimHasNo = claimVerdicts.includes('no');
  const claimAllYes = claimVerdicts.every((v) => v === 'yes');
  const conflict = (relevance >= CONFLICT_HIGH && claimHasNo) || (relevance <= CONFLICT_LOW && claimAllYes);
  const lowConfidence = Math.min(evidence.confidence, claim.confidence) < followupBelow;

  const issues: IssueCode[] = [];
  if (relevance < CONFLICT_HIGH) issues.push('photo_relevance');
  if (claim.amountPlausible !== 'yes') issues.push('amount');
  if (claim.beforeAfter === 'no' || claim.beforeAfter === 'unclear') issues.push('before_after');
  if (claim.descriptionMatches !== 'yes') issues.push('description');
  if (claim.dateContext !== 'yes') issues.push('date');
  if (issues.length === 0) issues.push('photo_relevance');

  if (!conflict && !lowConfidence) return { trigger: false, reason: null, issues: [] };
  return { trigger: true, reason: conflict ? 'conflict' : 'low_confidence', issues };
}

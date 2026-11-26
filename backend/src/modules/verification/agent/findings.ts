import type { AgentStep, ResponseSchema } from '../../../../libs/integration/ai/multimodal-model.js';
import { validateAgainstSchema } from './schema-validator.js';

/** Bump when a response schema changes (recorded in audit, FR-054). */
export const SCHEMA_VERSION = 'schema-v3';

export const PHOTO_FLAGS = [
  'screenshot',
  'stock_or_watermark',
  'ai_generated',
  'people_visible',
  'embedded_instructions',
  'unrelated_scene',
] as const;
export type PhotoFlag = (typeof PHOTO_FLAGS)[number];

export const QUALITIES = ['good', 'fair', 'poor'] as const;
export type Quality = (typeof QUALITIES)[number];

export const VERDICTS = ['yes', 'no', 'unclear'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const ISSUE_CODES = ['photo_relevance', 'amount', 'before_after', 'description', 'date'] as const;
export type IssueCode = (typeof ISSUE_CODES)[number];

export interface EvidenceFindings {
  photos: { index: number; relevance: number; quality: Quality; flags: PhotoFlag[] }[];
  /** Ids from the type's evidence criteria that are NOT visibly met. */
  criteriaUnmet: string[];
  confidence: number;
}

export interface ClaimFindings {
  amountPlausible: Verdict;
  beforeAfter: Verdict | 'n_a';
  descriptionMatches: Verdict;
  dateContext: Verdict;
  /** OTHER only: is the described activity plausibly environmental. `n_a` for every other type. */
  environmental?: Verdict | 'n_a';
  confidence: number;
}

export interface FollowupFindings {
  answers: { issue: IssueCode; verdict: Verdict }[];
  confidence: number;
}

const unit = { type: 'number', minimum: 0, maximum: 1 } as const;
const verdict: ResponseSchema = { type: 'string', enum: VERDICTS };

export function evidenceSchema(photoCount: number, criteriaIds: readonly string[]): ResponseSchema {
  return {
    type: 'object',
    required: ['photos', 'criteriaUnmet', 'confidence'],
    properties: {
      photos: {
        type: 'array',
        minItems: photoCount,
        maxItems: photoCount,
        items: {
          type: 'object',
          required: ['index', 'relevance', 'quality', 'flags'],
          properties: {
            index: { type: 'integer', minimum: 0, maximum: Math.max(0, photoCount - 1) },
            relevance: unit,
            quality: { type: 'string', enum: QUALITIES },
            flags: { type: 'array', maxItems: PHOTO_FLAGS.length, items: { type: 'string', enum: PHOTO_FLAGS } },
          },
        },
      },
      criteriaUnmet: {
        type: 'array',
        maxItems: criteriaIds.length,
        items: { type: 'string', enum: criteriaIds },
      },
      confidence: unit,
    },
  };
}

export function claimSchema(environmentalCheck = false): ResponseSchema {
  return {
    type: 'object',
    required: [
      'amountPlausible',
      'beforeAfter',
      'descriptionMatches',
      'dateContext',
      ...(environmentalCheck ? ['environmental'] : []),
      'confidence',
    ],
    properties: {
      amountPlausible: verdict,
      beforeAfter: { type: 'string', enum: [...VERDICTS, 'n_a'] },
      descriptionMatches: verdict,
      dateContext: verdict,
      environmental: { type: 'string', enum: environmentalCheck ? VERDICTS : ['n_a'] },
      confidence: unit,
    },
  };
}

/** Only the issues actually asked may be answered; the enum is limited to them (security review S2-1). */
export function followupSchema(issues: readonly IssueCode[] = ISSUE_CODES): ResponseSchema {
  return {
    type: 'object',
    required: ['answers', 'confidence'],
    properties: {
      answers: {
        type: 'array',
        maxItems: issues.length,
        items: {
          type: 'object',
          required: ['issue', 'verdict'],
          properties: { issue: { type: 'string', enum: issues }, verdict },
        },
      },
      confidence: unit,
    },
  };
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Validates and types the evidence response. Photo indexes must be exactly 0..n-1 (each once). */
export function parseEvidence(
  json: unknown,
  photoCount: number,
  criteriaIds: readonly string[],
): ParseResult<EvidenceFindings> {
  const checked = validateAgainstSchema(evidenceSchema(photoCount, criteriaIds), json);
  if (!checked.ok) return checked;
  const value = checked.value as EvidenceFindings;
  const seen = new Set(value.photos.map((p) => p.index));
  if (seen.size !== photoCount) return { ok: false, errors: ['$.photos:indexMismatch'] };
  return { ok: true, value };
}

export function parseClaim(json: unknown, environmentalCheck = false): ParseResult<ClaimFindings> {
  const checked = validateAgainstSchema(claimSchema(environmentalCheck), json);
  if (!checked.ok) return checked;
  const value = checked.value as ClaimFindings;
  return { ok: true, value: { ...value, environmental: value.environmental ?? 'n_a' } };
}

/** Rejects issues that were not asked and duplicate answers for the same issue. */
export function parseFollowup(
  json: unknown,
  issues: readonly IssueCode[] = ISSUE_CODES,
): ParseResult<FollowupFindings> {
  const checked = validateAgainstSchema(followupSchema(issues), json);
  if (!checked.ok) return checked;
  const value = checked.value as FollowupFindings;
  if (new Set(value.answers.map((a) => a.issue)).size !== value.answers.length) {
    return { ok: false, errors: ['$.answers:duplicate'] };
  }
  return { ok: true, value };
}

export function schemaFor(
  step: AgentStep,
  photoCount: number,
  criteriaIds: readonly string[],
  issues: readonly IssueCode[] = ISSUE_CODES,
  environmentalCheck = false,
): ResponseSchema {
  switch (step) {
    case 'evidence':
      return evidenceSchema(photoCount, criteriaIds);
    case 'claim':
      return claimSchema(environmentalCheck);
    case 'followup':
      return followupSchema(issues);
  }
}

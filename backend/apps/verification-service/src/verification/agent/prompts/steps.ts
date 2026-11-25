import type { GenerateRequest, ModelPart } from '../../../../../../libs/integration/ai/multimodal-model.js';
import type { IssueCode } from '../findings.js';
import { claimSchema, evidenceSchema, followupSchema } from '../findings.js';
import { claimContext, imageParts, SYSTEM_PROMPT, quoteUntrusted, type AgentInput } from './common.js';

/** The part of a generate request that the prompt templates own (budget fields are added by the runner). */
export type StepPrompt = Pick<GenerateRequest, 'system' | 'parts' | 'responseSchema'>;

/** Step 1: per-photo relevance, quality, unmet criteria, flags (FR-009, FR-024 flag only). */
export function buildEvidencePrompt(input: AgentInput): StepPrompt {
  const criteria = input.type.criteria.length
    ? input.type.criteria.map((c) => `- id ${JSON.stringify(c.id)}: ${c.text}`).join('\n')
    : '(no specific criteria)';
  const text = [
    'Step: evidence. For each photo rate relevance to the activity type (0..1), quality, and any flags.',
    `Activity type: ${input.type.code} (category: ${input.type.category})`,
    'Evidence criteria (list the ids that are NOT visibly met in criteriaUnmet):',
    criteria,
    'Return one entry per photo with its index. Give an overall confidence 0..1.',
  ].join('\n');
  return {
    system: SYSTEM_PROMPT,
    parts: [{ type: 'text', text }, ...imageParts(input)],
    responseSchema: evidenceSchema(
      input.photos.length,
      input.type.criteria.map((c) => c.id),
    ),
  };
}

/** Step 2: claim consistency (amount, FR-011 before/after, description, date). */
export function buildClaimPrompt(input: AgentInput): StepPrompt {
  const text = [
    'Step: claim. Judge whether the participant claim is consistent with the photos.',
    input.type.requiresBeforeAfter
      ? 'This type requires before and after photos: judge beforeAfter.'
      : 'This type has no before/after requirement: set beforeAfter to "n_a".',
    claimContext(input),
    'Answer yes, no or unclear for amountPlausible, descriptionMatches and dateContext. Give an overall confidence 0..1.',
  ].join('\n');
  return {
    system: SYSTEM_PROMPT,
    parts: [{ type: 'text', text }, ...imageParts(input)],
    responseSchema: claimSchema(),
  };
}

/** Step 3 (at most once): resolve only the listed issue codes. */
export function buildFollowupPrompt(input: AgentInput, issues: readonly IssueCode[]): StepPrompt {
  const text = [
    'Step: followup. Earlier answers were uncertain or inconsistent. Re-check only these issue codes:',
    issues.join(', '),
    'Return one answer (yes, no or unclear) per listed issue and a fresh confidence 0..1.',
    // Participant text is not needed to judge the photos, so it is left out of a photo_relevance-only question.
    ...(issues.every((i) => i === 'photo_relevance') ? [] : [claimContext(input)]),
  ].join('\n');
  return {
    system: SYSTEM_PROMPT,
    parts: [{ type: 'text', text }, ...imageParts(input)],
    responseSchema: followupSchema(issues),
  };
}

/**
 * Repair prompt: quotes only the validator's error paths (`path:code`), never the previous output
 * (ADR-0012 section 4). Error paths are re-quoted as data.
 */
export function buildRepairParts(original: StepPrompt, errors: readonly string[]): ModelPart[] {
  return [
    ...original.parts,
    {
      type: 'text',
      text: [
        'Your previous answer did not match the schema. Answer again with valid JSON only.',
        quoteUntrusted('schema_errors', errors.slice(0, 20)),
      ].join('\n'),
    },
  ];
}

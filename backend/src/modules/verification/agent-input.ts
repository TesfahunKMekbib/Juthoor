import type { VerificationSubject } from '../activity/activities.service.js';
import type { ActivityTypeRecord } from '../activity/activity-types.service.js';
import type { AgentInput } from './agent/prompts/index.js';

/**
 * Evidence for the agent (ADR-0012 section 6). Pure. Never includes coordinates, user ids or file names
 * (NFR-007, NFR-008). The activity type has no separate criteria list yet, so its English description is the
 * single evidence criterion `c1`; before/after is required when the type needs both photo kinds (FR-011).
 */
export function buildAgentInput(
  subject: VerificationSubject,
  type: ActivityTypeRecord,
  photos: { kind: string; mimeType: string; data: Uint8Array }[],
): AgentInput {
  const kinds = type.photoRules.neededKinds;
  return {
    type: {
      code: type.code,
      category: type.category,
      criteria: [{ id: 'c1', text: type.description.en }],
      requiresBeforeAfter: kinds.includes('before') && kinds.includes('after'),
      environmentalCheck: type.category === 'other',
    },
    photos,
    description: subject.description,
    answers: Object.entries(subject.answers).map(([key, value]) => ({ key, value: String(value) })),
    amount: subject.amount,
    doneAtDate: subject.doneAt.toISOString().slice(0, 10),
    emirate: subject.emirate,
  };
}

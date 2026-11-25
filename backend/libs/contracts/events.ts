/**
 * Event payload contracts shared by every service (arch-microservices plan section 3, ADR-0013).
 * Payloads carry IDs, codes and numbers only: never coordinates, emirate, description, answers or photos
 * (NFR-004, NFR-007). Dates are ISO-8601 strings so a payload survives JSON on a broker unchanged.
 */

export const EVENT_VERSION = 1 as const;

export const PRODUCERS = ['activity-service', 'verification-service'] as const;
export type Producer = (typeof PRODUCERS)[number];

export const DECISION_STATUSES = ['accepted', 'returned_for_correction', 'rejected'] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/** activity-service -> verification-service (FR-015, FR-028). */
export interface ActivitySubmittedPayload {
  userId: string;
  activityTypeCode: string;
  category: string;
  submittedAt: string;
}

/** verification-service -> activity-service: the final outcome (FR-026, FR-027, FR-054). */
export interface VerificationDecidedPayload {
  status: DecisionStatus;
  reasonCode: string | null;
  decidedAt: string;
}

/** verification-service -> activity-service: technical failure, the activity waits (FR-028). */
export interface VerificationDeferredPayload {
  reasonCode: string;
  attempt: number;
}

/** activity-service -> future Notification (FR-028). */
export interface ActivityDecidedPayload {
  userId: string;
  status: DecisionStatus;
  reasonCode: string | null;
  decidedAt: string;
}

/** Published once, only for Accepted (FR-032, FR-046). */
export interface ActivityAcceptedPayload {
  userId: string;
  activityTypeCode: string;
  category: string;
  amount: { value: number; unit: string };
  doneAt: string;
}

export interface EventPayloads {
  ActivitySubmitted: ActivitySubmittedPayload;
  VerificationDecided: VerificationDecidedPayload;
  VerificationDeferred: VerificationDeferredPayload;
  ActivityDecided: ActivityDecidedPayload;
  ActivityAccepted: ActivityAcceptedPayload;
}
export type EventType = keyof EventPayloads;

export const EVENT_TYPES = [
  'ActivitySubmitted',
  'VerificationDecided',
  'VerificationDeferred',
  'ActivityDecided',
  'ActivityAccepted',
] as const satisfies readonly EventType[];

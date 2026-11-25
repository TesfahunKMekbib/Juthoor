import {
  DECISION_STATUSES,
  EVENT_TYPES,
  EVENT_VERSION,
  PRODUCERS,
  type EventPayloads,
  type EventType,
  type Producer,
} from './events.js';

/**
 * Versioned envelope around every event. `activityId` is the idempotency key and partition key
 * (FR-015, FR-028, FR-054); `eventId` identifies one logical event so retries are recognisable.
 */
export interface EventEnvelope<K extends EventType = EventType> {
  eventId: string;
  type: K;
  version: typeof EVENT_VERSION;
  occurredAt: string;
  activityId: string;
  producer: Producer;
  payload: EventPayloads[K];
}

export interface EnvelopeOptions {
  now?: Date;
  /** Extra eventId part for events that may legitimately repeat per activity (e.g. a retry attempt). */
  eventIdSuffix?: string | number;
}

export function createEnvelope<K extends EventType>(
  type: K,
  activityId: string,
  producer: Producer,
  payload: EventPayloads[K],
  options: EnvelopeOptions = {},
): EventEnvelope<K> {
  const suffix = options.eventIdSuffix === undefined ? '' : `:${options.eventIdSuffix}`;
  return {
    eventId: `${type}:${activityId}${suffix}`,
    type,
    version: EVENT_VERSION,
    occurredAt: (options.now ?? new Date()).toISOString(),
    activityId,
    producer,
    payload,
  };
}

type FieldKind = 'string' | 'nullableString' | 'iso' | 'int' | 'status' | 'amount';

/** Exact allow-list per type: an unknown key (e.g. emirate, description) is rejected (NFR-004, NFR-007). */
const PAYLOAD_FIELDS: Record<EventType, Record<string, FieldKind>> = {
  ActivitySubmitted: { userId: 'string', activityTypeCode: 'string', category: 'string', submittedAt: 'iso' },
  VerificationDecided: { status: 'status', reasonCode: 'nullableString', decidedAt: 'iso' },
  VerificationDeferred: { reasonCode: 'string', attempt: 'int' },
  ActivityDecided: { userId: 'string', status: 'status', reasonCode: 'nullableString', decidedAt: 'iso' },
  ActivityAccepted: {
    userId: 'string',
    activityTypeCode: 'string',
    category: 'string',
    amount: 'amount',
    doneAt: 'iso',
  },
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isIso = (v: unknown): boolean => typeof v === 'string' && !Number.isNaN(Date.parse(v));

function fieldOk(kind: FieldKind, v: unknown): boolean {
  switch (kind) {
    case 'string':
      return isNonEmpty(v);
    case 'nullableString':
      return v === null || isNonEmpty(v);
    case 'iso':
      return isIso(v);
    case 'int':
      return Number.isInteger(v);
    case 'status':
      return (DECISION_STATUSES as readonly unknown[]).includes(v);
    case 'amount':
      return (
        isRecord(v) &&
        Object.keys(v).length === 2 &&
        typeof v['value'] === 'number' &&
        Number.isFinite(v['value']) &&
        isNonEmpty(v['unit'])
      );
  }
}

export type EnvelopeValidation = { ok: true; envelope: EventEnvelope } | { ok: false; errors: string[] };

/** Validates an untrusted value (e.g. a decoded broker message). Error texts never echo field values. */
export function validateEnvelope(value: unknown): EnvelopeValidation {
  if (!isRecord(value)) return { ok: false, errors: ['envelope must be an object'] };
  const errors: string[] = [];
  if (!isNonEmpty(value['eventId'])) errors.push('eventId must be a non-empty string');
  if (value['version'] !== EVENT_VERSION) errors.push(`version must be ${EVENT_VERSION}`);
  if (!isIso(value['occurredAt'])) errors.push('occurredAt must be an ISO date');
  if (!isNonEmpty(value['activityId'])) errors.push('activityId must be a non-empty string');
  if (!(PRODUCERS as readonly unknown[]).includes(value['producer'])) errors.push('producer is not known');
  const type = value['type'];
  if (!(EVENT_TYPES as readonly unknown[]).includes(type)) {
    errors.push('type is not known');
    return { ok: false, errors };
  }
  const fields = PAYLOAD_FIELDS[type as EventType];
  const payload = value['payload'];
  if (!isRecord(payload)) {
    errors.push('payload must be an object');
  } else {
    for (const key of Object.keys(payload)) if (!(key in fields)) errors.push(`payload.${key} is not allowed`);
    for (const [key, kind] of Object.entries(fields)) {
      if (!fieldOk(kind, payload[key])) errors.push(`payload.${key} is invalid`);
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, envelope: value as unknown as EventEnvelope };
}

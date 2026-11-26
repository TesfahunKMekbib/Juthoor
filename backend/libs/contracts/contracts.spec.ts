import { createEnvelope, validateEnvelope } from './envelope.js';
import { EVENT_TYPES, type EventType } from './events.js';
import { dlqTopic, FUTURE_TOPICS, TOPICS, topicFor } from './topics.js';

const NOW = new Date('2026-11-25T10:00:00.000Z');

const good = () =>
  createEnvelope(
    'ActivityAccepted',
    'a1',
    'activity-service',
    {
      userId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      activityTypeCode: 'TREE_PLANTING',
      category: 'planting',
      amount: { value: 2, unit: 'trees' },
      doneAt: '2026-11-24T00:00:00.000Z',
    },
    { now: NOW },
  );

describe('createEnvelope', () => {
  it('builds a versioned envelope keyed by the activityId (FR-015, FR-028, FR-054)', () => {
    expect(good()).toMatchObject({
      eventId: 'ActivityAccepted:a1',
      type: 'ActivityAccepted',
      version: 1,
      occurredAt: '2026-11-25T10:00:00.000Z',
      activityId: 'a1',
      producer: 'activity-service',
    });
  });

  it('appends an eventId suffix for repeatable events, and defaults occurredAt to now', () => {
    const e = createEnvelope(
      'VerificationDeferred',
      'a1',
      'verification-service',
      {
        reasonCode: 'processing.retrying',
        attempt: 2,
      },
      { eventIdSuffix: 2 },
    );
    expect(e.eventId).toBe('VerificationDeferred:a1:2');
    expect(Number.isNaN(Date.parse(e.occurredAt))).toBe(false);
  });
});

describe('validateEnvelope', () => {
  it('accepts a good envelope for every event type', () => {
    expect(validateEnvelope(good())).toEqual({ ok: true, envelope: good() });
    const samples: Record<EventType, unknown> = {
      ActivitySubmitted: {
        userId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        activityTypeCode: 'T',
        category: 'c',
        submittedAt: NOW.toISOString(),
      },
      VerificationDecided: { status: 'rejected', reasonCode: null, decidedAt: NOW.toISOString() },
      VerificationDeferred: { reasonCode: 'r', attempt: 1 },
      ActivityDecided: {
        userId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        status: 'accepted',
        reasonCode: 'x',
        decidedAt: NOW.toISOString(),
      },
      ActivityAccepted: good().payload,
    };
    for (const type of EVENT_TYPES) {
      const env = {
        ...good(),
        type,
        eventId: type === 'VerificationDeferred' ? `${type}:a1:1` : `${type}:a1`,
        payload: samples[type],
      };
      expect(validateEnvelope(env).ok).toBe(true);
    }
  });

  it('rejects non-objects, unknown types and bad envelope fields', () => {
    expect(validateEnvelope(null).ok).toBe(false);
    expect(validateEnvelope([]).ok).toBe(false);
    expect(validateEnvelope({ ...good(), type: 'Nope' })).toEqual({
      ok: false,
      errors: expect.arrayContaining(['type is not known']),
    });
    const bad = validateEnvelope({
      ...good(),
      eventId: '',
      version: 2,
      occurredAt: 'x',
      activityId: '',
      producer: 'other',
    });
    expect(bad).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        'eventId must be a non-empty string',
        'version must be 1',
        'occurredAt must be an ISO date',
        'activityId must be a non-empty string',
        'producer is not known',
      ]),
    });
  });

  it('rejects a payload that is not an object or has invalid fields', () => {
    expect(validateEnvelope({ ...good(), payload: 'x' })).toEqual({
      ok: false,
      errors: ['payload must be an object'],
    });
    const result = validateEnvelope({
      ...good(),
      payload: { ...good().payload, amount: { value: 'a', unit: 'x' }, userId: 5, doneAt: 'nope' },
    });
    expect(result).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        'payload.amount is invalid',
        'payload.userId is invalid',
        'payload.doneAt is invalid',
      ]),
    });
    const amountExtra = validateEnvelope({
      ...good(),
      payload: { ...good().payload, amount: { value: 1, unit: 'x', y: 1 } },
    });
    expect(amountExtra.ok).toBe(false);
  });

  it('rejects personal or location data in a payload and never echoes values (NFR-004, NFR-007)', () => {
    const result = validateEnvelope({
      ...good(),
      type: 'ActivitySubmitted',
      payload: {
        userId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        activityTypeCode: 'T',
        category: 'c',
        submittedAt: NOW.toISOString(),
        emirate: 'Dubai',
        description: 'secret-text',
        coordinates: [1, 2],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          'payload.emirate is not allowed',
          'payload.description is not allowed',
          'payload.coordinates is not allowed',
        ]),
      );
      expect(JSON.stringify(result.errors)).not.toContain('secret-text');
    }
  });

  it('checks the decision status, nullable reason and integer attempt', () => {
    expect(
      validateEnvelope({
        ...good(),
        type: 'VerificationDecided',
        payload: { status: 'maybe', reasonCode: 3, decidedAt: NOW.toISOString() },
      }).ok,
    ).toBe(false);
    expect(
      validateEnvelope({ ...good(), type: 'VerificationDeferred', payload: { reasonCode: 'r', attempt: 1.5 } }).ok,
    ).toBe(false);
  });
});

describe('payload identifiers (hardening)', () => {
  const withPayload = (patch: Record<string, unknown>) =>
    validateEnvelope({ ...good(), payload: { ...good().payload, ...patch } });

  it('requires a 24-hex userId', () => {
    expect(withPayload({ userId: 'u1' }).ok).toBe(false);
    expect(withPayload({ userId: 'A'.repeat(24) }).ok).toBe(false);
    expect(withPayload({ userId: 'a1b2c3d4e5f6a1b2c3d4e5f6' }).ok).toBe(true);
  });

  it('limits codes, categories and units to short identifiers, and accepts the seeded ones', () => {
    for (const ok of ['TREE_PLANTING', 'planting', 'kg', 'kWh', 'liters', 'verification.evidenceUnrelated']) {
      expect(withPayload({ activityTypeCode: ok, category: ok, amount: { value: 1, unit: ok } }).ok).toBe(true);
    }
    for (const bad of ['has space', 'x'.repeat(65), 'a/b', '<script>', '']) {
      expect(withPayload({ activityTypeCode: bad }).ok).toBe(false);
      expect(withPayload({ category: bad }).ok).toBe(false);
      expect(withPayload({ amount: { value: 1, unit: bad } }).ok).toBe(false);
    }
  });

  it('limits reasonCode the same way', () => {
    const base = {
      eventId: 'VerificationDecided:a1',
      type: 'VerificationDecided',
      payload: { status: 'rejected', decidedAt: NOW.toISOString() },
    };
    expect(
      validateEnvelope({ ...good(), ...base, payload: { ...base.payload, reasonCode: 'processing.retrying' } }).ok,
    ).toBe(true);
    expect(
      validateEnvelope({ ...good(), ...base, payload: { ...base.payload, reasonCode: 'free text here' } }).ok,
    ).toBe(false);
  });
});

describe('VerificationDeferred eventId carries the attempt', () => {
  const payload = { reasonCode: 'processing.retrying', attempt: 2 };
  it('createEnvelope refuses to build one without eventIdSuffix', () => {
    expect(() => createEnvelope('VerificationDeferred', 'a1', 'verification-service', payload)).toThrow(
      /eventIdSuffix/,
    );
  });
  it('validateEnvelope rejects an eventId that does not end with the attempt', () => {
    const ok = createEnvelope('VerificationDeferred', 'a1', 'verification-service', payload, { eventIdSuffix: 2 });
    expect(validateEnvelope(ok).ok).toBe(true);
    const shared = validateEnvelope({ ...ok, eventId: 'VerificationDeferred:a1' });
    expect(shared).toEqual({ ok: false, errors: ['eventId must end with the attempt for VerificationDeferred'] });
  });
});

describe('topics', () => {
  it('names one versioned topic per event type', () => {
    expect(TOPICS).toEqual({
      ActivitySubmitted: 'juthoor.activity.submitted.v1',
      VerificationDecided: 'juthoor.verification.decided.v1',
      VerificationDeferred: 'juthoor.verification.deferred.v1',
      ActivityDecided: 'juthoor.activity.decided.v1',
      ActivityAccepted: 'juthoor.activity.accepted.v1',
    });
    expect(new Set(Object.values(TOPICS)).size).toBe(EVENT_TYPES.length);
    expect(topicFor('ActivityAccepted')).toBe('juthoor.activity.accepted.v1');
  });

  it('derives the dead-letter topic and reserves future-service names only', () => {
    expect(dlqTopic(TOPICS.ActivitySubmitted)).toBe('juthoor.activity.submitted.v1.dlq');
    expect(Object.values(FUTURE_TOPICS).every((t) => /^juthoor\.[a-z]+\.[a-z]+\.v1$/.test(t))).toBe(true);
    for (const t of Object.values(FUTURE_TOPICS)) expect(Object.values(TOPICS)).not.toContain(t);
  });
});

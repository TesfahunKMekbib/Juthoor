import type { EventType } from './events.js';

/** Broker topic per event type; the partition key is always the activityId (plan section 3). */
export const TOPICS = {
  ActivitySubmitted: 'juthoor.activity.submitted.v1',
  VerificationDecided: 'juthoor.verification.decided.v1',
  VerificationDeferred: 'juthoor.verification.deferred.v1',
  ActivityDecided: 'juthoor.activity.decided.v1',
  ActivityAccepted: 'juthoor.activity.accepted.v1',
} as const satisfies Record<EventType, string>;

/**
 * Names reserved for future services (plan section 8). Contract names only: nothing publishes or consumes
 * them yet and no payload types exist until the owning service is planned.
 */
export const FUTURE_TOPICS = {
  UserRegistered: 'juthoor.user.registered.v1',
  UserDeleted: 'juthoor.user.deleted.v1',
  RewardsIssued: 'juthoor.rewards.issued.v1',
  ImpactRecorded: 'juthoor.impact.recorded.v1',
  ChallengeProgressed: 'juthoor.challenge.progressed.v1',
} as const;

export const topicFor = (type: EventType): string => TOPICS[type];

/** Dead-letter topic for a topic (plan section 3: handler failures after retries). */
export const dlqTopic = (topic: string): string => `${topic}.dlq`;

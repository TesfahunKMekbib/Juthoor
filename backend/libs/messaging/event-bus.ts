import type { EventEnvelope, EventType } from '../contracts/index.js';

export type EventHandler<K extends EventType = EventType> = (envelope: EventEnvelope<K>) => unknown;

/**
 * Port for publishing and consuming events (NFR-023). Adapters (in-memory now, Kafka in T5) are selected by
 * configuration; domain services depend only on this class, which is also the Nest injection token.
 * Consumers must treat `envelope.activityId` as an idempotency key (FR-015, FR-028, FR-046).
 */
export abstract class EventBus {
  /** Resolves once the adapter has accepted the event. Never rejects because of a subscriber. */
  abstract publish<K extends EventType>(envelope: EventEnvelope<K>): Promise<void>;
  /** Returns an unsubscribe function. */
  abstract subscribe<K extends EventType>(type: K, handler: EventHandler<K>): () => void;
}

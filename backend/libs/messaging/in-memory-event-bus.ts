import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { validateEnvelope, type EventEnvelope, type EventType } from '../contracts/index.js';
import { EventBus, type EventHandler } from './event-bus.js';

/**
 * In-process adapter for the single-process run and for tests (replaces the former EventsService).
 * A failing subscriber (sync throw or async rejection) never propagates to the publisher or other
 * subscribers: the publisher's own work (e.g. a saved submission) must not be undone by a downstream
 * handler (FR-015, FR-028). Delivery to sync handlers happens before `publish` returns.
 *
 * Envelopes are validated on both sides (NFR-004, NFR-007): `publish` rejects an invalid one before emitting,
 * and the consume wrapper drops one that arrives invalid. The Kafka adapter (T5) MUST do the same, because
 * broker messages are untrusted input.
 */
@Injectable()
export class InMemoryEventBus extends EventBus {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger(InMemoryEventBus.name);

  publish<K extends EventType>(envelope: EventEnvelope<K>): Promise<void> {
    const checked = validateEnvelope(envelope);
    if (!checked.ok) {
      // Rejected promise (not a sync throw) so a publisher's .catch handles it; the message names fields only.
      return Promise.reject(new Error(`Invalid event envelope: ${checked.errors.join('; ')}`));
    }
    this.emitter.emit(envelope.type, envelope);
    return Promise.resolve();
  }

  /** Async handlers are awaited and their rejections logged. */
  subscribe<K extends EventType>(type: K, handler: EventHandler<K>): () => void {
    // Log only the event type and idempotency key, never the payload (personal data) or the error text.
    const fail = (envelope: EventEnvelope<K>, err: unknown) =>
      this.logger.error(
        `Subscriber for ${type} failed (activityId=${envelope.activityId}): ${err instanceof Error ? err.name : 'error'}`,
      );
    const safe = (envelope: EventEnvelope<K>) => {
      const checked = validateEnvelope(envelope);
      if (!checked.ok) {
        // Drop it; log the eventId (if it is a string) and the field-level reasons, never values.
        const id = typeof envelope?.eventId === 'string' ? envelope.eventId : 'unknown';
        this.logger.error(`Dropped invalid ${type} event (eventId=${id}): ${checked.errors.join('; ')}`);
        return;
      }
      try {
        const pending: unknown = handler(envelope);
        if (pending instanceof Promise) pending.catch((err: unknown) => fail(envelope, err));
      } catch (err) {
        fail(envelope, err);
      }
    };
    this.emitter.on(type, safe);
    return () => {
      this.emitter.off(type, safe);
    };
  }
}

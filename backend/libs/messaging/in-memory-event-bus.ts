import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { EventEnvelope, EventType } from '../contracts/index.js';
import { EventBus, type EventHandler } from './event-bus.js';

/**
 * In-process adapter for the single-process run and for tests (replaces the former EventsService).
 * A failing subscriber (sync throw or async rejection) never propagates to the publisher or other
 * subscribers: the publisher's own work (e.g. a saved submission) must not be undone by a downstream
 * handler (FR-015, FR-028). Delivery to sync handlers happens before `publish` returns.
 */
@Injectable()
export class InMemoryEventBus extends EventBus {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger(InMemoryEventBus.name);

  publish<K extends EventType>(envelope: EventEnvelope<K>): Promise<void> {
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

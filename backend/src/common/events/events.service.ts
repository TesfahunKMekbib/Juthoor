import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/** Fields every event carries. `activityId` is the idempotency key (FR-015, FR-028, FR-046). */
export interface BaseEvent {
  activityId: string;
}

export interface ActivitySubmittedEvent extends BaseEvent {
  userId: string;
  activityTypeCode: string;
  category: string;
  amount: { value: number; unit: string };
  emirate: string;
  doneAt: Date;
}

/** Event names and their payloads. Add new events here. */
export interface EventMap {
  ActivitySubmitted: ActivitySubmittedEvent;
}
export type EventName = keyof EventMap;

/**
 * Minimal in-process event bus. Subscribers must treat `activityId` as an idempotency key.
 * A failing subscriber never propagates to the publisher or other subscribers: the publisher's
 * own work (e.g. a saved submission) must not be undone by a downstream handler (FR-015, FR-028).
 */
@Injectable()
export class EventsService {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger(EventsService.name);

  publish<K extends EventName>(name: K, payload: EventMap[K]): void {
    this.emitter.emit(name, payload);
  }

  /** Returns an unsubscribe function. */
  subscribe<K extends EventName>(name: K, handler: (payload: EventMap[K]) => void): () => void {
    const safe = (payload: EventMap[K]) => {
      try {
        handler(payload);
      } catch (err) {
        // Log only the event name and idempotency key — never the payload (personal data).
        this.logger.error(`Subscriber for ${name} failed (activityId=${payload.activityId}): ${String(err)}`);
      }
    };
    this.emitter.on(name, safe);
    return () => {
      this.emitter.off(name, safe);
    };
  }
}

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
  amount: { value: number; unit: string } | null;
  emirate: string;
  doneAt: Date;
}

/** A final verification outcome (plan section 4; FR-026, FR-027). */
export interface ActivityDecidedEvent extends BaseEvent {
  userId: string;
  status: 'accepted' | 'returned_for_correction' | 'rejected';
  reasonCode: string | null;
  decidedAt: Date;
}

/** Published once, only for Accepted. No subscriber yet: rewards are out of scope (FR-032, FR-046). */
export interface ActivityAcceptedEvent extends BaseEvent {
  userId: string;
  activityTypeCode: string;
  category: string;
  amount: { value: number; unit: string } | null;
  doneAt: Date;
}

/** Event names and their payloads. Add new events here. */
export interface EventMap {
  ActivitySubmitted: ActivitySubmittedEvent;
  ActivityDecided: ActivityDecidedEvent;
  ActivityAccepted: ActivityAcceptedEvent;
}
export type EventName = keyof EventMap;

/**
 * Minimal in-process event bus. Subscribers must treat `activityId` as an idempotency key.
 * A failing subscriber (sync throw or async rejection) never propagates to the publisher or other
 * subscribers: the publisher's own work (e.g. a saved submission) must not be undone by a downstream
 * handler (FR-015, FR-028).
 */
@Injectable()
export class EventsService {
  private readonly emitter = new EventEmitter();
  private readonly logger = new Logger(EventsService.name);

  publish<K extends EventName>(name: K, payload: EventMap[K]): void {
    this.emitter.emit(name, payload);
  }

  /** Returns an unsubscribe function. Async handlers are awaited and their rejections logged. */
  subscribe<K extends EventName>(name: K, handler: (payload: EventMap[K]) => unknown): () => void {
    // Log only the event name and idempotency key, never the payload (personal data) or the error text.
    const fail = (payload: EventMap[K], err: unknown) =>
      this.logger.error(
        `Subscriber for ${name} failed (activityId=${payload.activityId}): ${err instanceof Error ? err.name : 'error'}`,
      );
    const safe = (payload: EventMap[K]) => {
      try {
        const pending: unknown = handler(payload);
        if (pending instanceof Promise) pending.catch((err: unknown) => fail(payload, err));
      } catch (err) {
        fail(payload, err);
      }
    };
    this.emitter.on(name, safe);
    return () => {
      this.emitter.off(name, safe);
    };
  }
}

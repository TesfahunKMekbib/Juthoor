import { Logger } from '@nestjs/common';
import type { EventEnvelope } from '../contracts/index.js';
import type { EventBus } from './event-bus.js';

/** One pending event stored with its owning document (activity or job), plan section 3 "Outbox". */
export interface OutboxEntry {
  /** Id of the owning document; lets the store find the embedded entry to mark. */
  ownerId: string;
  envelope: EventEnvelope;
}

/**
 * Port over the persisted outbox. The Mongo adapter (T4) keeps entries as an embedded array written in the
 * same single-document update as the state change, so the write is atomic without transactions.
 */
export interface OutboxStore {
  /** Oldest unsent entries first. */
  findPending(limit: number): Promise<OutboxEntry[]>;
  /** Idempotent: marking an already-sent entry is a no-op. */
  markSent(ownerId: string, eventId: string, at: Date): Promise<void>;
}

export interface OutboxRelayOptions {
  pollMs: number;
  batchSize: number;
}

export interface RelayResult {
  sent: number;
  failed: number;
}

/**
 * Polls the outbox, publishes each pending event and then marks it sent: at-least-once delivery. If marking
 * fails after a successful publish the event is published again on the next run, so consumers must be
 * idempotent (activityId / eventId). A publish failure leaves the entry pending and is retried next run;
 * it never blocks the other entries. Logs only eventId, never the payload.
 */
export class OutboxRelay {
  private readonly logger = new Logger('OutboxRelay');
  private timer: NodeJS.Timeout | undefined;
  private current: Promise<RelayResult> | undefined;

  constructor(
    private readonly store: OutboxStore,
    private readonly bus: EventBus,
    private readonly options: OutboxRelayOptions,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** One relay pass. A call while a pass is running joins it instead of starting a second one. */
  runOnce(): Promise<RelayResult> {
    this.current ??= this.pass().finally(() => {
      this.current = undefined;
    });
    return this.current;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce().catch(() => undefined), this.options.pollMs);
    this.timer.unref();
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    await this.current?.catch(() => undefined);
  }

  private async pass(): Promise<RelayResult> {
    const result: RelayResult = { sent: 0, failed: 0 };
    let pending: OutboxEntry[];
    try {
      pending = await this.store.findPending(this.options.batchSize);
    } catch {
      this.logger.error('Outbox read failed');
      return result;
    }
    for (const entry of pending) {
      const { eventId } = entry.envelope;
      try {
        await this.bus.publish(entry.envelope);
        await this.store.markSent(entry.ownerId, eventId, this.now());
        result.sent += 1;
      } catch (err) {
        result.failed += 1;
        this.logger.error(`Outbox relay failed (eventId=${eventId}): ${err instanceof Error ? err.name : 'error'}`);
      }
    }
    return result;
  }
}

/** Test and single-process store; the first-sent entry is never returned again. */
export class InMemoryOutboxStore implements OutboxStore {
  private readonly entries: { entry: OutboxEntry; sentAt: Date | null }[] = [];

  add(entry: OutboxEntry): void {
    this.entries.push({ entry, sentAt: null });
  }

  findPending(limit: number): Promise<OutboxEntry[]> {
    return Promise.resolve(
      this.entries
        .filter((e) => e.sentAt === null)
        .slice(0, limit)
        .map((e) => e.entry),
    );
  }

  markSent(ownerId: string, eventId: string, at: Date): Promise<void> {
    const found = this.entries.find((e) => e.entry.ownerId === ownerId && e.entry.envelope.eventId === eventId);
    if (found) found.sentAt ??= at;
    return Promise.resolve();
  }

  sentAt(eventId: string): Date | null | undefined {
    return this.entries.find((e) => e.entry.envelope.eventId === eventId)?.sentAt;
  }
}

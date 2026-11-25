import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventsService } from '../../../../libs/common/events/events.service.js';
import type { VerificationService } from './verification.service.js';

/**
 * Background loop: an immediate attempt per ActivitySubmitted plus a sweeper every VERIFY_POLL_MS (FR-028).
 * Never starts by itself in unit tests: only `start()` or Nest's onModuleInit (when enabled) begins work, and
 * `stop()` / onModuleDestroy (enableShutdownHooks) ends it after in-flight work finishes.
 */
export class VerificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('VerificationWorker');
  private timer: NodeJS.Timeout | undefined;
  private unsubscribe: (() => void) | undefined;
  private readonly inFlight = new Set<Promise<unknown>>();

  constructor(
    private readonly service: VerificationService,
    private readonly events: EventsService,
    private readonly options: { enabled: boolean; pollMs: number },
  ) {}

  onModuleInit(): void {
    if (this.options.enabled) this.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  start(): void {
    if (this.timer) return;
    this.unsubscribe = this.events.subscribe('ActivitySubmitted', (e) =>
      this.track(this.service.onSubmitted(e.activityId)),
    );
    this.timer = setInterval(() => void this.track(this.service.sweep()), this.options.pollMs);
    this.timer.unref();
    this.logger.log(`Verification worker started (poll ${this.options.pollMs} ms)`);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    await Promise.allSettled([...this.inFlight]);
  }

  private track<T>(work: Promise<T>): Promise<T> {
    this.inFlight.add(work);
    const done = () => this.inFlight.delete(work);
    work.then(done, done);
    return work;
  }
}

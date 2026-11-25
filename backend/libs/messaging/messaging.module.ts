import { Global, Module } from '@nestjs/common';
import { EventBus } from './event-bus.js';
import { InMemoryEventBus } from './in-memory-event-bus.js';

/** Provides the EventBus port. Only the in-memory adapter exists until the Kafka adapter (T5). */
@Global()
@Module({
  providers: [{ provide: EventBus, useClass: InMemoryEventBus }],
  exports: [EventBus],
})
export class MessagingModule {}

// DEVELOPMENT ONLY (ADR-0010). Only src/app.module.ts may import this file, and only when
// NODE_ENV=development and JUTHOOR_DEV_PARTICIPANT=true. The production image deletes dist/src/dev.
import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { PARTICIPANT_RESOLVER } from '../common/identity/participant.js';
import { DEV_PARTICIPANT_ID, DevParticipantResolver, devParticipantHeader } from './dev-participant.js';

@Module({
  providers: [{ provide: PARTICIPANT_RESOLVER, useClass: DevParticipantResolver }],
  exports: [PARTICIPANT_RESOLVER],
})
export class DevParticipantModule implements NestModule {
  constructor() {
    new Logger('DevParticipantModule').warn(
      `Development participant ${DEV_PARTICIPANT_ID} is ACTIVE: every request is treated as that participant. Never use in production.`,
    );
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(devParticipantHeader).forRoutes('*path');
  }
}

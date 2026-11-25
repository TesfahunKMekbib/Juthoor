import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { NoParticipantResolver, PARTICIPANT_RESOLVER } from './participant.js';
import { ParticipantGuard } from './participant.guard.js';

/**
 * Binds the global guard and the resolver (ADR-0010). Without an override module the default resolver
 * identifies nobody, so participant endpoints answer 401. An override module must export PARTICIPANT_RESOLVER.
 */
@Module({})
export class IdentityModule {
  static register(resolverModule?: Type<unknown>): DynamicModule {
    return {
      module: IdentityModule,
      imports: resolverModule ? [resolverModule] : [],
      providers: [
        ...(resolverModule ? [] : [{ provide: PARTICIPANT_RESOLVER, useClass: NoParticipantResolver }]),
        { provide: APP_GUARD, useClass: ParticipantGuard },
      ],
    };
  }
}

import { type DynamicModule, Module, type Type } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { devParticipantMode } from '../libs/common/config/dev-participant-mode.js';
import { MessagingModule } from '../libs/messaging/index.js';
import { IdentityModule } from '../libs/common/identity/identity.module.js';
import { ActivityModule } from '../apps/activity-service/src/activity/activity.module.js';
import { VerificationModule } from '../apps/verification-service/src/verification/verification.module.js';

@Module({})
export class AppModule {
  /**
   * Builds the root module. The development participant (ADR-0010) is loaded through a dynamic import,
   * and only when NODE_ENV=development and JUTHOOR_DEV_PARTICIPANT=true; this is the only place allowed
   * to reference src/dev.
   */
  static async forRoot(env: Record<string, string | undefined>): Promise<DynamicModule> {
    let resolverModule: Type<unknown> | undefined;
    if (devParticipantMode(env) === 'enabled') {
      resolverModule = (await import('./dev/dev-participant.module.js')).DevParticipantModule;
    }
    return {
      module: AppModule,
      imports: [
        MongooseModule.forRoot(env.MONGODB_URI || 'mongodb://localhost:27017/juthoor'),
        IdentityModule.register(resolverModule),
        MessagingModule,
        ActivityModule,
        VerificationModule,
      ],
    };
  }
}

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadAppConfig } from '../libs/common/config/app-config.js';
import { assertDevParticipantAllowed } from '../libs/common/config/dev-participant-mode.js';
import { ApiExceptionFilter } from '../libs/common/errors/http-exception.filter.js';
import { assertAiProviderAllowed, parseAiConfig } from '../libs/integration/ai/ai-config.js';
import { parseVerificationConfig } from './modules/verification/verification-config.js';

async function bootstrap(): Promise<void> {
  // Fail fast, before anything listens (ADR-0010, ADR-0012, plan section 4).
  assertDevParticipantAllowed(process.env);
  assertAiProviderAllowed(process.env);
  const config = loadAppConfig(process.env);
  parseAiConfig(process.env); // validation only; the modules build their own copy
  parseVerificationConfig(process.env);

  const app = await NestFactory.create(await AppModule.forRoot(process.env));
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks(); // stops the verification worker cleanly (FR-028)
  await app.listen(config.port);
}

void bootstrap();

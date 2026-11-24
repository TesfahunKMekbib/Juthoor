import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadAppConfig } from './common/config/app-config.js';
import { assertDevParticipantAllowed } from './common/config/dev-participant-mode.js';
import { ApiExceptionFilter } from './common/errors/http-exception.filter.js';

async function bootstrap(): Promise<void> {
  // Fail fast, before anything listens (ADR-0010, plan section 4).
  assertDevParticipantAllowed(process.env);
  const config = loadAppConfig(process.env);

  const app = await NestFactory.create(await AppModule.forRoot(process.env));
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(config.port);
}

void bootstrap();

import { Module } from '@nestjs/common';
import { assertAiProviderAllowed, createMultimodalModel, parseAiConfig, type AiConfig } from './ai-config.js';
import { MULTIMODAL_MODEL } from './multimodal-model.js';

export const AI_CONFIG = Symbol('AI_CONFIG');

@Module({
  providers: [
    {
      provide: AI_CONFIG,
      useFactory: (): AiConfig => {
        assertAiProviderAllowed(process.env);
        return parseAiConfig(process.env);
      },
    },
    {
      provide: MULTIMODAL_MODEL,
      useFactory: (config: AiConfig) => createMultimodalModel(config),
      inject: [AI_CONFIG],
    },
  ],
  exports: [MULTIMODAL_MODEL, AI_CONFIG],
})
export class AiModule {}

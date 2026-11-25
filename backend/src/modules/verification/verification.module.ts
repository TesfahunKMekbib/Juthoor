import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsService } from '../../common/events/events.service.js';
import { ActivitiesService } from '../activity/activities.service.js';
import { ActivityModule } from '../activity/activity.module.js';
import { ActivityTypesService } from '../activity/activity-types.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuditService } from '../audit/audit.service.js';
import { AI_CONFIG, AiModule } from '../integration/ai/ai.module.js';
import type { AiConfig } from '../integration/ai/ai-config.js';
import { IMAGE_PREPARER, type ImagePreparer } from '../integration/ai/image-prep.js';
import { MULTIMODAL_MODEL, type MultimodalModel } from '../integration/ai/multimodal-model.js';
import { ImageModule } from '../integration/image/image.module.js';
import { PHOTO_STORAGE, type PhotoStorage } from '../integration/storage/photo-storage.js';
import { StorageModule } from '../integration/storage/storage.module.js';
import { VerificationAgent } from './agent/verification-agent.js';
import { JOB_STORE, type JobStore } from './job-store.js';
import { MongoJobStore } from './mongo-job-store.js';
import { parseVerificationConfig, parseWorkerConfig } from './verification-config.js';
import { VerificationJob, VerificationJobSchema } from './verification-job.schema.js';
import { VerificationService } from './verification.service.js';
import { VerificationWorker } from './verification.worker.js';

const VERIFICATION_AGENT = Symbol('VERIFICATION_AGENT');
const VERIFICATION_SERVICE_CONFIG = Symbol('VERIFICATION_SERVICE_CONFIG');

/** Verification domain (FR-024-028, FR-054): job queue, worker, agent wiring. Config is validated at boot. */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: VerificationJob.name, schema: VerificationJobSchema }]),
    ActivityModule,
    AuditModule,
    AiModule,
    ImageModule,
    StorageModule,
  ],
  providers: [
    { provide: JOB_STORE, useClass: MongoJobStore },
    {
      provide: VERIFICATION_SERVICE_CONFIG,
      useFactory: () => ({ ...parseVerificationConfig(process.env), worker: parseWorkerConfig(process.env) }),
    },
    {
      provide: VERIFICATION_AGENT,
      useFactory: (ai: AiConfig, model: MultimodalModel, preparer: ImagePreparer) =>
        new VerificationAgent(model, preparer, {
          maxCalls: ai.maxCalls,
          totalBudgetMs: ai.totalBudgetMs,
          minCallMs: ai.minCallMs,
          perCallTimeoutMs: ai.timeoutMs,
          followupBelow: ai.followupBelow,
          imageMaxPx: ai.imageMaxPx,
          maxImages: ai.maxImages,
          maxOutputTokens: ai.maxOutputTokens,
        }),
      inject: [AI_CONFIG, MULTIMODAL_MODEL, IMAGE_PREPARER],
    },
    {
      provide: VerificationService,
      useFactory: (
        cfg: ReturnType<typeof parseVerificationConfig> & { worker: ReturnType<typeof parseWorkerConfig> },
        activities: ActivitiesService,
        types: ActivityTypesService,
        photos: PhotoStorage,
        agent: VerificationAgent,
        audit: AuditService,
        store: JobStore,
      ) =>
        new VerificationService({
          activities,
          types,
          photos,
          agent,
          audit,
          store,
          thresholds: cfg.thresholds,
          retry: cfg.retry,
          leaseMs: cfg.worker.leaseMs,
          batchSize: cfg.worker.batchSize,
        }),
      inject: [
        VERIFICATION_SERVICE_CONFIG,
        ActivitiesService,
        ActivityTypesService,
        PHOTO_STORAGE,
        VERIFICATION_AGENT,
        AuditService,
        JOB_STORE,
      ],
    },
    {
      provide: VerificationWorker,
      useFactory: (
        service: VerificationService,
        events: EventsService,
        cfg: ReturnType<typeof parseVerificationConfig> & { worker: ReturnType<typeof parseWorkerConfig> },
      ) => new VerificationWorker(service, events, { enabled: cfg.worker.enabled, pollMs: cfg.pollMs }),
      inject: [VerificationService, EventsService, VERIFICATION_SERVICE_CONFIG],
    },
  ],
  exports: [VerificationService],
})
export class VerificationModule {}

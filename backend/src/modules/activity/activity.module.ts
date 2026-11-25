import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createLocationCipher } from '../../common/config/app-config.js';
import { ImageModule } from '../integration/image/image.module.js';
import { StorageModule } from '../integration/storage/storage.module.js';
import { ActivitiesController } from './activities.controller.js';
import { ActivitiesService } from './activities.service.js';
import { ActivityType, ActivityTypeSchema } from './activity-type.schema.js';
import { ActivityTypesController } from './activity-types.controller.js';
import { ActivityTypesService } from './activity-types.service.js';
import { Activity, ActivitySchema } from './activity.schema.js';
import { LOCATION_CIPHER } from './activity.tokens.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Activity.name, schema: ActivitySchema },
      { name: ActivityType.name, schema: ActivityTypeSchema },
    ]),
    StorageModule,
    ImageModule,
  ],
  controllers: [ActivityTypesController, ActivitiesController],
  providers: [
    ActivitiesService,
    ActivityTypesService,
    // One place turns the configured key (hex or base64) into the cipher (NFR-004).
    { provide: LOCATION_CIPHER, useFactory: () => createLocationCipher(process.env.LOCATION_ENCRYPTION_KEY) },
  ],
  exports: [ActivitiesService, ActivityTypesService],
})
export class ActivityModule {}

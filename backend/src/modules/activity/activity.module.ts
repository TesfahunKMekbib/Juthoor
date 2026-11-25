import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { StorageModule } from '../integration/storage/storage.module.js';
import { ActivitiesService } from './activities.service.js';
import { ActivityType, ActivityTypeSchema } from './activity-type.schema.js';
import { ActivityTypesController } from './activity-types.controller.js';
import { ActivityTypesService } from './activity-types.service.js';
import { Activity, ActivitySchema } from './activity.schema.js';

// No activities controller yet: the submission endpoint arrives with authentication (Q-A2).
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Activity.name, schema: ActivitySchema },
      { name: ActivityType.name, schema: ActivityTypeSchema },
    ]),
    StorageModule,
  ],
  controllers: [ActivityTypesController],
  providers: [ActivitiesService, ActivityTypesService],
  exports: [ActivitiesService, ActivityTypesService],
})
export class ActivityModule {}

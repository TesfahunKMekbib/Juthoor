import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventsModule } from './common/events/events.module.js';
import { ActivityModule } from './modules/activity/activity.module.js';

@Module({
  imports: [
    MongooseModule.forRoot(process.env.MONGODB_URI ?? 'mongodb://localhost:27017/juthoor'),
    EventsModule,
    ActivityModule,
  ],
})
export class AppModule {}

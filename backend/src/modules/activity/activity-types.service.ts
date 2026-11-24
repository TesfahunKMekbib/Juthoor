import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { ActivityType } from './activity-type.schema.js';

export type ActivityTypeRecord = ActivityType & { _id: Types.ObjectId; __v?: number };

@Injectable()
export class ActivityTypesService {
  constructor(@InjectModel(ActivityType.name) private readonly types: Model<ActivityType>) {}

  /** Published activity types (FR-009). */
  findPublished(): Promise<ActivityTypeRecord[]> {
    return this.types.find({ status: 'published' }).sort({ code: 1 }).lean<ActivityTypeRecord[]>();
  }

  async findById(id: string): Promise<ActivityTypeRecord> {
    const type = isValidObjectId(id) ? await this.types.findById(id).lean<ActivityTypeRecord>() : null;
    if (!type) throw new NotFoundException('Activity type not found');
    return type;
  }

  /** A published activity type for participants; draft/archived types are hidden as 404 (FR-009). */
  async findPublishedById(id: string): Promise<ActivityTypeRecord> {
    const type = await this.findById(id);
    if (type.status !== 'published') throw new NotFoundException('Activity type not found');
    return type;
  }

  findByIds(ids: string[]): Promise<ActivityTypeRecord[]> {
    const valid = ids.filter((id) => isValidObjectId(id));
    return this.types.find({ _id: { $in: valid } }).lean<ActivityTypeRecord[]>();
  }
}

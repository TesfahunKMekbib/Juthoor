import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { isValidObjectId, Model, Types } from 'mongoose';
import { ActivityTypesService } from '../activity-types/activity-types.service.js';
import { EventsService } from '../common/events.js';
import {
  PhotosService,
  type PhotoToStore,
  type StoredPhoto,
} from '../photos/photos.service.js';
import {
  Activity,
  ACTIVITY_STATUSES,
  type ActivityStatus,
} from './activity.schema.js';
import { checkSubmission, type SubmissionInput } from './submission-rules.js';

type ActivityRecord = Activity & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};
type TypeRecord = Awaited<ReturnType<ActivityTypesService['findById']>>;

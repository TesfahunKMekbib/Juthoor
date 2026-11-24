import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { isValidObjectId, Model, Types } from 'mongoose';
import { ValidationFailedException } from '../../common/errors/validation-failed.exception.js';
import { EventsService } from '../../common/events/events.service.js';
import {
  PHOTO_STORAGE,
  type PhotoStorage,
  type PhotoToStore,
  type StoredPhoto,
} from '../integration/storage/photo-storage.js';
import { ActivityTypesService, type ActivityTypeRecord } from './activity-types.service.js';
import { Activity, ACTIVITY_STATUSES, type ActivityStatus } from './activity.schema.js';
import { checkSubmission, type SubmissionInput } from './submission-rules.js';

type ActivityRecord = Activity & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};
type TypeRecord = ActivityTypeRecord;

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectModel(Activity.name) private readonly activities: Model<Activity>,
    private readonly types: ActivityTypesService,
    @Inject(PHOTO_STORAGE) private readonly photos: PhotoStorage,
    private readonly events: EventsService,
  ) {}

  async submit(userId: string, rawData: string | undefined, files: PhotoToStore[], submitKeyHeader?: string) {
    const input = this.parseData(rawData);
    const submitKey = (submitKeyHeader ?? '').trim().slice(0, 100) || randomUUID();
    const userObjectId = new Types.ObjectId(userId);

    const existing = await this.activities.findOne({ userId: userObjectId, submitKey }).lean<ActivityRecord>();
    if (existing) return { created: false, activity: await this.toView(existing) };

    if (typeof input.activityTypeId !== 'string' || !isValidObjectId(input.activityTypeId)) {
      throw new ValidationFailedException([
        { field: 'activityTypeId', code: 'activityType.required', message: 'Please choose an activity type.' },
      ]);
    }
    const type = await this.types.findById(input.activityTypeId);
    if (type.status !== 'published') {
      throw new ValidationFailedException([
        { field: 'activityTypeId', code: 'activityType.unavailable', message: 'This activity type is not available.' },
      ]);
    }

    const { errors, clean } = checkSubmission(type, input, files);
    if (!clean) throw new ValidationFailedException(errors);
    // Device location needs the geo provider (B4b/B5); until it is wired only the manual emirate works.
    if (clean.location.source !== 'manual' || !clean.location.emirate) {
      throw new ValidationFailedException([
        { field: 'location.source', code: 'location.sourceInvalid', message: 'Choose an emirate manually.' },
      ]);
    }
    const emirate = clean.location.emirate;

    // Store the photos, then the activity. If saving the activity fails, remove the photos again.
    const stored: StoredPhoto[] = [];
    let record: ActivityRecord;
    try {
      for (const [i, file] of files.entries()) {
        stored.push(await this.photos.save(file, { userId, kind: clean.photoKinds[i] }));
      }
      const now = new Date();
      const created = await this.activities.create({
        userId: userObjectId,
        activityTypeId: type._id,
        typeVersion: type.version,
        description: clean.description,
        doneAt: clean.doneAt,
        location: { emirate, area: clean.location.area },
        answers: clean.answers,
        amount: { value: clean.amountValue, unit: type.amount.unit },
        photos: stored.map((p, i) => ({ ...p, kind: clean.photoKinds[i], uploadedAt: now })),
        status: 'submitted',
        submitKey,
        statusHistory: [{ from: null, to: 'submitted', reasonCode: null, at: now }],
        submittedAt: now,
      });
      record = created.toObject() as ActivityRecord;
    } catch (err) {
      await this.photos.remove(stored.map((p) => p.fileId));
      if ((err as { code?: number }).code === 11000) {
        // Two identical requests arrived at the same time: return the one that won.
        const winner = await this.activities.findOne({ userId: userObjectId, submitKey }).lean<ActivityRecord>();
        if (winner) return { created: false, activity: await this.toView(winner) };
      }
      throw err;
    }

    // Published only after the activity is safely stored, outside the photo-cleanup block, so a
    // downstream failure can never leave a saved activity pointing at deleted photos (FR-015, FR-028).
    this.events.publish('ActivitySubmitted', {
      activityId: String(record._id),
      userId,
      activityTypeCode: type.code,
      category: type.category,
      amount: record.amount,
      emirate: record.location.emirate,
      doneAt: record.doneAt,
    });
    return { created: true, activity: await this.toView(record, type) };
  }

  async listForUser(userId: string, status?: string) {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (status) {
      if (!(ACTIVITY_STATUSES as readonly string[]).includes(status)) throw new BadRequestException('Unknown status');
      filter.status = status;
    }
    const list = await this.activities.find(filter).sort({ submittedAt: -1 }).limit(100).lean<ActivityRecord[]>();
    const types = await this.types.findByIds([...new Set(list.map((a) => String(a.activityTypeId)))]);
    const byId = new Map(types.map((t) => [String(t._id), t]));
    return Promise.all(list.map((a) => this.toView(a, byId.get(String(a.activityTypeId)))));
  }

  async getForUser(userId: string, id: string) {
    const activity = isValidObjectId(id)
      ? await this.activities
          .findOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) })
          .lean<ActivityRecord>()
      : null;
    if (!activity) throw new NotFoundException({ code: 'activity.notFound', message: 'Activity not found' });
    return this.toView(activity);
  }

  /** Moves an activity to a final status, only if it is still waiting. Used by the checker. */
  async decide(
    activityId: Types.ObjectId,
    to: Exclude<ActivityStatus, 'draft' | 'submitted'>,
    reasonCode: string | null,
  ) {
    const now = new Date();
    return this.activities
      .findOneAndUpdate(
        { _id: activityId, status: 'submitted' },
        {
          $set: { status: to, resultReasonCode: reasonCode },
          $push: { statusHistory: { from: 'submitted', to, reasonCode, at: now } },
        },
        { returnDocument: 'after' },
      )
      .lean<ActivityRecord>();
  }

  findWaiting(submittedBefore: Date, limit = 20) {
    return this.activities
      .find({ status: 'submitted', submittedAt: { $lte: submittedBefore } })
      .sort({ submittedAt: 1 })
      .limit(limit)
      .lean<ActivityRecord[]>();
  }

  private parseData(raw: string | undefined): SubmissionInput {
    if (!raw)
      throw new BadRequestException({
        code: 'request.malformed',
        message: 'Missing "data" field with the activity details (JSON).',
      });
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
      return parsed as SubmissionInput;
    } catch {
      throw new BadRequestException({ code: 'request.malformed', message: '"data" must be a JSON object.' });
    }
  }

  /** The shape the app receives. */
  private async toView(a: ActivityRecord, type?: TypeRecord) {
    const t = type ?? (await this.types.findById(String(a.activityTypeId)).catch(() => undefined));
    const labels = new Map((t?.formFields ?? []).map((f) => [f.key, f.label]));
    return {
      id: String(a._id),
      status: a.status,
      resultReasonCode: a.resultReasonCode ?? null,
      activityType: t
        ? { id: String(t._id), code: t.code, category: t.category, name: t.name }
        : { id: String(a.activityTypeId), code: '', category: '', name: { en: 'Unknown', ar: 'غير معروف' } },
      description: a.description,
      doneAt: a.doneAt,
      location: a.location,
      answers: Object.entries(a.answers ?? {}).map(([key, value]) => ({
        key,
        label: labels.get(key) ?? { en: key, ar: key },
        value,
      })),
      amount: a.amount,
      photos: a.photos.map((p) => ({
        id: String(p.fileId),
        kind: p.kind,
        url: `/api/photos/${String(p.fileId)}`,
        fileName: p.fileName,
        mimeType: p.mimeType,
        sizeBytes: p.sizeBytes,
      })),
      statusHistory: a.statusHistory.map(({ from, to, reasonCode, at }) => ({
        from,
        to,
        reasonCode: reasonCode ?? null,
        at,
      })),
      submittedAt: a.submittedAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}

// @ts-ignore: NestJS types may be unavailable in the current TypeScript environment.
import { Module } from '@nestjs/common';
import { ActivitiesController } from './activities.controller';
import { ActivitiesService } from './activities.service';

@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule { }

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectModel(Activity.name) private readonly activities: Model<Activity>,
    private readonly types: ActivityTypesService,
    private readonly photos: PhotosService,
    private readonly events: EventsService,
  ) {}

  async submit(userId: string, rawData: string | undefined, files: PhotoToStore[], submitKeyHeader?: string) {
    const input = this.parseData(rawData);
    const submitKey = (submitKeyHeader ?? '').trim().slice(0, 100) || randomUUID();
    const userObjectId = new Types.ObjectId(userId);

    const existing = await this.activities.findOne({ userId: userObjectId, submitKey }).lean<ActivityRecord>();
    if (existing) return { created: false, activity: await this.toView(existing) };

    if (typeof input.activityTypeId !== 'string' || !isValidObjectId(input.activityTypeId)) {
      throw this.validationError([{ field: 'activityTypeId', message: 'Please choose an activity type.' }]);
    }
    const type = await this.types.findById(input.activityTypeId);
    if (type.status !== 'published') {
      throw this.validationError([{ field: 'activityTypeId', message: 'This activity type is not available.' }]);
    }

    const { errors, clean } = checkSubmission(type, input, files);
    if (!clean) throw this.validationError(errors);

    // Store the photos, then the activity. If saving the activity fails, remove the photos again.
    const stored: StoredPhoto[] = [];
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
        location: clean.location,
        answers: clean.answers,
        amount: { value: clean.amountValue, unit: type.amount.unit },
        photos: stored.map((p, i) => ({ ...p, kind: clean.photoKinds[i], uploadedAt: now })),
        status: 'submitted',
        submitKey,
        statusHistory: [{ from: null, to: 'submitted', reason: '', at: now }],
        submittedAt: now,
      });
      const record = created.toObject() as ActivityRecord;
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
    } catch (err) {
      await this.photos.remove(stored.map((p) => p.fileId));
      if ((err as { code?: number }).code === 11000) {
        // Two identical requests arrived at the same time: return the one that won.
        const winner = await this.activities.findOne({ userId: userObjectId, submitKey }).lean<ActivityRecord>();
        if (winner) return { created: false, activity: await this.toView(winner) };
      }
      throw err;
    }
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
      ? await this.activities.findOne({ _id: id, userId: new Types.ObjectId(userId) }).lean<ActivityRecord>()
      : null;
    if (!activity) throw new NotFoundException('Activity not found');
    return this.toView(activity);
  }

  /** Moves an activity to a final status, only if it is still waiting. Used by the checker. */
  async decide(activityId: Types.ObjectId, to: Exclude<ActivityStatus, 'submitted'>, reason: string) {
    const now = new Date();
    return this.activities
      .findOneAndUpdate(
        { _id: activityId, status: 'submitted' },
        {
          $set: { status: to, resultReason: reason },
          $push: { statusHistory: { from: 'submitted', to, reason, at: now } },
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
    if (!raw) throw new BadRequestException('Missing "data" field with the activity details (JSON).');
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
      return parsed as SubmissionInput;
    } catch {
      throw new BadRequestException('"data" must be a JSON object.');
    }
  }

  private validationError(errors: { field: string; message: string }[]) {
    return new UnprocessableEntityException({
      statusCode: 422,
      message: 'Please fix the highlighted fields.',
      errors,
    });
  }

  /** The shape the app receives. */
  private async toView(a: ActivityRecord, type?: TypeRecord) {
    const t = type ?? (await this.types.findById(String(a.activityTypeId)).catch(() => undefined));
    const labels = new Map((t?.formFields ?? []).map((f) => [f.key, f.label]));
    return {
      id: String(a._id),
      status: a.status,
      resultReason: a.resultReason,
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
      statusHistory: a.statusHistory.map(({ from, to, reason, at }) => ({ from, to, reason, at })),
      submittedAt: a.submittedAt,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }
}

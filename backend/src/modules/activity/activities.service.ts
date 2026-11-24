import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { isValidObjectId, Model, Types } from 'mongoose';
import type { FieldCipher } from '../../common/crypto/field-cipher.js';
import { type ErrorDetail, ValidationFailedException } from '../../common/errors/validation-failed.exception.js';
import { EventsService } from '../../common/events/events.service.js';
import { GEO_BOUNDARY_PROVIDER, type GeoBoundaryProvider } from '../integration/geo/geo-boundary-provider.js';
import {
  EVIDENCE_SANITIZER,
  EvidenceRejectedError,
  type EvidenceSanitizer,
  type SanitizedEvidence,
} from '../integration/image/evidence-sanitizer.js';
import { detectImageType } from '../integration/image/image-signature.js';
import {
  PHOTO_STORAGE,
  type PhotoStorage,
  type PhotoToStore,
  type StoredPhoto,
} from '../integration/storage/photo-storage.js';
import { ActivityTypesService, type ActivityTypeRecord } from './activity-types.service.js';
import { Activity, ACTIVITY_STATUSES, type ActivityLocation, type ActivityStatus } from './activity.schema.js';
import { LOCATION_CIPHER } from './activity.tokens.js';
import { checkSubmission, type SubmissionInput } from './submission-rules.js';

type ActivityRecord = Activity & {
  _id: Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
};
type TypeRecord = ActivityTypeRecord;

const MB = 1024 * 1024;
const MAX_PHOTO_DIMENSION = 2560;

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(
    @InjectModel(Activity.name) private readonly activities: Model<Activity>,
    private readonly types: ActivityTypesService,
    @Inject(PHOTO_STORAGE) private readonly photos: PhotoStorage,
    private readonly events: EventsService,
    @Inject(GEO_BOUNDARY_PROVIDER) private readonly geo: GeoBoundaryProvider,
    @Inject(EVIDENCE_SANITIZER) private readonly sanitizer: EvidenceSanitizer,
    @Inject(LOCATION_CIPHER) private readonly cipher: FieldCipher,
  ) {}

  /**
   * Plan section 3 order: idempotency (FR-015), pure rules (FR-018-021, FR-023), location (FR-012, FR-020),
   * sanitize (FR-021, NFR-008), store, save, publish. Deterministic failures create no record (Q-E3).
   * A file's real type comes from its leading bytes; the client's MIME type is ignored (FR-021).
   */
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

    const { errors, clean } = checkSubmission(
      type,
      input,
      files.map((f) => ({ mimetype: detectImageType(f.buffer) ?? 'application/octet-stream', size: f.size })),
    );
    if (!clean) throw new ValidationFailedException(errors);

    // Device coordinates live in memory only and are checked against the UAE boundaries (FR-020, ADR-0006).
    let emirate = clean.location.emirate;
    if (clean.location.source === 'device' && clean.location.coordinates) {
      const found = this.geo.locate(clean.location.coordinates.lat, clean.location.coordinates.lng);
      if (found === 'outsideUae') {
        throw new ValidationFailedException([
          { field: 'location', code: 'location.outsideUae', message: 'The activity must be in the UAE.' },
        ]);
      }
      emirate = found;
    }
    if (!emirate) {
      throw new ValidationFailedException([
        { field: 'location', code: 'location.emirateInvalid', message: 'Please choose an emirate in the UAE.' },
      ]);
    }

    // Re-encode every photo: EXIF/GPS dropped, file name generated (NFR-007, NFR-008).
    const clearPhotos = await this.sanitizeAll(files, type.photoRules.maxSizeMB * MB);
    const location: ActivityLocation = { emirate, area: clean.location.area };
    const locationEnc = this.cipher.encryptJson(location);

    // Store the photos, then the activity. If saving the activity fails, remove the photos again.
    const stored: StoredPhoto[] = [];
    let record: ActivityRecord;
    try {
      for (const [i, photo] of clearPhotos.entries()) {
        stored.push(
          await this.photos.save(
            { originalname: photo.fileName, mimetype: photo.mimeType, size: photo.sizeBytes, buffer: photo.buffer },
            { userId, kind: clean.photoKinds[i] },
          ),
        );
      }
      const now = new Date();
      const created = await this.activities.create({
        userId: userObjectId,
        activityTypeId: type._id,
        typeVersion: type.version,
        description: clean.description,
        doneAt: clean.doneAt,
        locationEnc,
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
      emirate,
      doneAt: record.doneAt,
    });
    return { created: true, activity: await this.toView(record, type) };
  }

  private async sanitizeAll(files: PhotoToStore[], maxBytes: number): Promise<SanitizedEvidence[]> {
    const out: SanitizedEvidence[] = [];
    const errors: ErrorDetail[] = [];
    for (const [i, file] of files.entries()) {
      try {
        out.push(await this.sanitizer.sanitize(file.buffer, { maxBytes, maxDimension: MAX_PHOTO_DIMENSION }));
      } catch (err) {
        if (!(err instanceof EvidenceRejectedError)) throw err;
        errors.push({
          field: `photos[${i}]`,
          code: `photos.${err.code}`,
          message: 'This photo cannot be used. Please choose another one.',
        });
      }
    }
    if (errors.length) throw new ValidationFailedException(errors);
    return out;
  }

  /** The bytes of one photo of the caller's own activity; anything else is a 404 (NFR-009, NFR-025). */
  async getPhotoForUser(userId: string, activityId: string, photoId: string) {
    const notFound = () => new NotFoundException({ code: 'photo.notFound', message: 'Photo not found' });
    if (!isValidObjectId(activityId) || !isValidObjectId(photoId)) throw notFound();
    const fileId = new Types.ObjectId(photoId);
    const owned = await this.activities
      .findOne({
        _id: new Types.ObjectId(activityId),
        userId: new Types.ObjectId(userId),
        'photos.fileId': fileId,
      })
      .lean<ActivityRecord>();
    if (!owned) throw notFound();
    const file = await this.photos.read(fileId);
    if (!file) throw notFound();
    return file;
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

  /** Owner-only: the location is decrypted here, so this must never serve anyone but the owner (NFR-004). */
  private decryptLocation(a: ActivityRecord): ActivityLocation | null {
    try {
      return this.cipher.decryptJson<ActivityLocation>(a.locationEnc);
    } catch {
      this.logger.error(`Location could not be decrypted (activityId=${String(a._id)})`);
      return null;
    }
  }

  /** The shape the app receives (plan section 1). */
  private async toView(a: ActivityRecord, type?: TypeRecord) {
    const t = type ?? (await this.types.findById(String(a.activityTypeId)).catch(() => undefined));
    const labels = new Map((t?.formFields ?? []).map((f) => [f.key, f.label]));
    const id = String(a._id);
    return {
      id,
      status: a.status,
      resultReasonCode: a.resultReasonCode ?? null,
      activityType: t
        ? { id: String(t._id), code: t.code, category: t.category, name: t.name }
        : { id: String(a.activityTypeId), code: '', category: '', name: { en: 'Unknown', ar: 'غير معروف' } },
      description: a.description,
      doneAt: a.doneAt,
      location: this.decryptLocation(a),
      answers: Object.entries(a.answers ?? {}).map(([key, value]) => ({
        key,
        label: labels.get(key) ?? { en: key, ar: key },
        value,
      })),
      amount: { value: a.amount.value, unit: a.amount.unit },
      acceptedAmount: a.status === 'accepted' ? { value: a.amount.value, unit: a.amount.unit } : null,
      photos: a.photos.map((p) => ({
        id: String(p.fileId),
        kind: p.kind,
        url: `/api/activities/${id}/photos/${String(p.fileId)}`,
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
      updatedAt: a.updatedAt,
    };
  }
}

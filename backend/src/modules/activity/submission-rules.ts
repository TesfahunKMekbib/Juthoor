import { EMIRATES, PHOTO_KINDS } from './activity.schema.js';

/** Version of the deterministic rule set; recorded with every decision (FR-018, FR-054). */
export const RULES_VERSION = 'rules-1';

export type FieldErrorCode =
  | 'activityType.required'
  | 'activityType.unavailable'
  | 'description.required'
  | 'description.tooLong'
  | 'doneAt.required'
  | 'doneAt.future'
  | 'location.sourceInvalid'
  | 'location.emirateInvalid'
  | 'location.outsideUae'
  | 'location.coordinatesInvalid'
  | 'location.areaTooLong'
  | 'answers.required'
  | 'answers.notNumber'
  | 'answers.invalidChoice'
  | 'answers.tooLong'
  | 'amount.required'
  | 'amount.outOfRange'
  | 'photos.tooFew'
  | 'photos.tooMany'
  | 'photos.kindMissing'
  | 'photos.kindUnknown'
  | 'photos.typeNotAllowed'
  | 'photos.tooLarge'
  | 'photos.unreadable';

/** One failed rule. The app renders text from `code` + `params` (NFR-016); `message` is an English fallback. */
export interface FieldError {
  field: string;
  code: FieldErrorCode;
  message: string;
  params?: Record<string, string | number>;
}

/** The parts of an activity type the rules need. */
export interface TypeRules {
  formFields: { key: string; label: { en: string }; type: string; options: string[]; required: boolean }[];
  amount: { unit: string; min: number; max: number };
  photoRules: { minPhotos: number; maxPhotos: number; neededKinds: string[]; maxSizeMB: number };
}

/** What the app sends (the "data" part of the request). */
export interface SubmissionInput {
  activityTypeId?: unknown;
  description?: unknown;
  doneAt?: unknown;
  location?: unknown; // { source: 'device' | 'manual', coordinates?, emirate?, area }
  answers?: unknown; // { [formField key]: value }
  amount?: unknown; // { value }
  photoKinds?: unknown; // one kind per uploaded file, same order
}

export interface UploadedPhotoInfo {
  mimetype: string;
  size: number;
}

/** Cleaned-up values, ready to save. */
export interface CleanSubmission {
  description: string;
  doneAt: Date;
  /** Device coordinates are for the in-memory geo lookup only; never stored (ADR-0006). */
  location: {
    source: 'device' | 'manual';
    emirate: string | null;
    area: string;
    coordinates?: { lat: number; lng: number };
  };
  answers: Record<string, string | number>;
  amountValue: number;
  photoKinds: string[];
}

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const CLOCK_SKEW_MS = 5 * 60 * 1000; // allow phones whose clock is a few minutes ahead

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const toNumber = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};

/** Pure deterministic checks (FR-018-021, FR-023). Failures return coded errors; no record is created (Q-E3). */
export function checkSubmission(
  type: TypeRules,
  input: SubmissionInput,
  photos: UploadedPhotoInfo[],
  now: Date = new Date(),
): { errors: FieldError[]; clean?: CleanSubmission } {
  const errors: FieldError[] = [];
  const add = (field: string, code: FieldErrorCode, message: string, params?: FieldError['params']) =>
    errors.push(params ? { field, code, message, params } : { field, code, message });

  // Description
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!description) add('description', 'description.required', 'Please describe what you did.');
  else if (description.length > 500)
    add('description', 'description.tooLong', 'Keep the description under 500 characters.', { max: 500 });

  // Date: must be a real date and not in the future (FR-019)
  const doneAt = typeof input.doneAt === 'string' || typeof input.doneAt === 'number' ? new Date(input.doneAt) : null;
  if (!doneAt || Number.isNaN(doneAt.getTime()))
    add('doneAt', 'doneAt.required', 'Please choose when the activity happened.');
  else if (doneAt.getTime() > now.getTime() + CLOCK_SKEW_MS)
    add('doneAt', 'doneAt.future', 'The date cannot be in the future.');

  // Location (FR-012, FR-020): device coordinates (checked against UAE boundaries later by the geo
  // provider) or a manually chosen emirate. Only the shape is checked here; no I/O.
  const location = isObject(input.location) ? input.location : {};
  const source = location.source === 'device' || location.source === 'manual' ? location.source : null;
  const area = typeof location.area === 'string' ? location.area.trim() : '';
  let emirate: string | null = null;
  let coordinates: { lat: number; lng: number } | undefined;
  if (!source) {
    add('location.source', 'location.sourceInvalid', 'Choose how to provide the location.');
  } else if (source === 'manual') {
    const e = typeof location.emirate === 'string' ? location.emirate : '';
    if (!(EMIRATES as readonly string[]).includes(e))
      add('location.emirate', 'location.emirateInvalid', 'Please choose an emirate in the UAE.');
    else emirate = e;
  } else {
    const c = isObject(location.coordinates) ? location.coordinates : {};
    const lat = typeof c.lat === 'number' ? c.lat : NaN;
    const lng = typeof c.lng === 'number' ? c.lng : NaN;
    if (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180))
      add('location.coordinates', 'location.coordinatesInvalid', 'The device location is not valid.');
    else coordinates = { lat, lng };
  }
  if (area.length > 100)
    add('location.area', 'location.areaTooLong', 'Keep the area name under 100 characters.', { max: 100 });

  // Answers to the type's extra questions (FR-011, FR-018)
  const rawAnswers = isObject(input.answers) ? input.answers : {};
  const answers: Record<string, string | number> = {};
  for (const f of type.formFields) {
    const raw = rawAnswers[f.key];
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    const field = `answers.${f.key}`;
    const params = { fieldKey: f.key };
    if (empty) {
      if (f.required) add(field, 'answers.required', `${f.label.en} is required.`, params);
      continue;
    }
    if (f.type === 'number') {
      const n = toNumber(raw);
      if (n === null || n < 0) add(field, 'answers.notNumber', `${f.label.en} must be a positive number.`, params);
      else answers[f.key] = n;
    } else if (f.type === 'choice') {
      if (typeof raw !== 'string' || !f.options.includes(raw))
        add(field, 'answers.invalidChoice', `Please choose a valid ${f.label.en.toLowerCase()}.`, params);
      else answers[f.key] = raw;
    } else {
      if (typeof raw !== 'string' && typeof raw !== 'number') {
        add(field, 'answers.invalidChoice', `${f.label.en} must be text.`, params);
        continue;
      }
      const s = String(raw).trim();
      if (s.length > 200) add(field, 'answers.tooLong', `${f.label.en} is too long.`, { ...params, max: 200 });
      else answers[f.key] = s;
    }
  }

  // Amount: number within the configured range; unit always comes from the type (FR-018)
  const amount = isObject(input.amount) ? input.amount : {};
  const amountValue = toNumber(amount.value);
  const { min, max, unit } = type.amount;
  if (amountValue === null) add('amount.value', 'amount.required', `Please enter how many ${unit}.`, { unit });
  else if (amountValue < min || amountValue > max)
    add('amount.value', 'amount.outOfRange', `Enter between ${min} and ${max} ${unit}.`, { min, max, unit });

  // Photos: count, kinds, file type and size (FR-021)
  const pr = type.photoRules;
  const kinds = Array.isArray(input.photoKinds) ? input.photoKinds : [];
  const photoKinds = photos.map((_, i) => (typeof kinds[i] === 'string' ? (kinds[i] as string) : 'photo'));
  if (photos.length < pr.minPhotos)
    add('photos', 'photos.tooFew', `Add at least ${pr.minPhotos} photo${pr.minPhotos > 1 ? 's' : ''}.`, {
      min: pr.minPhotos,
    });
  if (photos.length > pr.maxPhotos)
    add('photos', 'photos.tooMany', `Add no more than ${pr.maxPhotos} photos.`, { max: pr.maxPhotos });
  photoKinds.forEach((k, i) => {
    if (!(PHOTO_KINDS as readonly string[]).includes(k))
      add(`photos[${i}]`, 'photos.kindUnknown', `Unknown photo kind "${k.slice(0, 20)}".`, { kind: k.slice(0, 20) });
  });
  for (const needed of pr.neededKinds) {
    if (!photoKinds.includes(needed)) add('photos', 'photos.kindMissing', `Add a "${needed}" photo.`, { kind: needed });
  }
  photos.forEach((p, i) => {
    if (!ALLOWED_IMAGE_TYPES.includes(p.mimetype))
      add(`photos[${i}]`, 'photos.typeNotAllowed', 'Photos must be JPEG, PNG or WEBP.');
    if (p.size > pr.maxSizeMB * 1024 * 1024)
      add(`photos[${i}]`, 'photos.tooLarge', `Each photo must be under ${pr.maxSizeMB} MB.`, { maxMb: pr.maxSizeMB });
  });

  if (errors.length || !source) return { errors };
  return {
    errors,
    clean: {
      description,
      doneAt: doneAt as Date,
      location: coordinates ? { source, emirate, area, coordinates } : { source, emirate, area },
      answers,
      amountValue: amountValue as number,
      photoKinds,
    },
  };
}

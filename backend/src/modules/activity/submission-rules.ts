import { EMIRATES, PHOTO_KINDS } from './activity.schema.js';

export interface FieldError {
  field: string;
  message: string;
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
  location?: unknown; // { emirate, area }
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
  location: { emirate: string; area: string };
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

export function checkSubmission(
  type: TypeRules,
  input: SubmissionInput,
  photos: UploadedPhotoInfo[],
  now: Date = new Date(),
): { errors: FieldError[]; clean?: CleanSubmission } {
  const errors: FieldError[] = [];
  const add = (field: string, message: string) => errors.push({ field, message });

  // Description
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  if (!description) add('description', 'Please describe what you did.');
  else if (description.length > 500) add('description', 'Keep the description under 500 characters.');

  // Date: must be a real date and not in the future (FR-019)
  const doneAt = typeof input.doneAt === 'string' || typeof input.doneAt === 'number' ? new Date(input.doneAt) : null;
  if (!doneAt || Number.isNaN(doneAt.getTime())) add('doneAt', 'Please choose when the activity happened.');
  else if (doneAt.getTime() > now.getTime() + CLOCK_SKEW_MS) add('doneAt', 'The date cannot be in the future.');

  // Location: must be one of the seven emirates (FR-020)
  const location = isObject(input.location) ? input.location : {};
  const emirate = typeof location.emirate === 'string' ? location.emirate : '';
  const area = typeof location.area === 'string' ? location.area.trim() : '';
  if (!(EMIRATES as readonly string[]).includes(emirate))
    add('location.emirate', 'Please choose an emirate in the UAE.');
  if (area.length > 100) add('location.area', 'Keep the area name under 100 characters.');

  // Answers to the type's extra questions (FR-011, FR-018)
  const rawAnswers = isObject(input.answers) ? input.answers : {};
  const answers: Record<string, string | number> = {};
  for (const f of type.formFields) {
    const raw = rawAnswers[f.key];
    const empty = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    const field = `answers.${f.key}`;
    if (empty) {
      if (f.required) add(field, `${f.label.en} is required.`);
      continue;
    }
    if (f.type === 'number') {
      const n = toNumber(raw);
      if (n === null || n < 0) add(field, `${f.label.en} must be a positive number.`);
      else answers[f.key] = n;
    } else if (f.type === 'choice') {
      if (typeof raw !== 'string' || !f.options.includes(raw))
        add(field, `Please choose a valid ${f.label.en.toLowerCase()}.`);
      else answers[f.key] = raw;
    } else {
      if (typeof raw !== 'string' && typeof raw !== 'number') {
        add(field, `${f.label.en} must be text.`);
        continue;
      }
      const s = String(raw).trim();
      if (s.length > 200) add(field, `${f.label.en} is too long.`);
      else answers[f.key] = s;
    }
  }

  // Amount: number within the configured range; unit always comes from the type (FR-018)
  const amount = isObject(input.amount) ? input.amount : {};
  const amountValue = toNumber(amount.value);
  const { min, max, unit } = type.amount;
  if (amountValue === null) add('amount.value', `Please enter how many ${unit}.`);
  else if (amountValue < min || amountValue > max) add('amount.value', `Enter between ${min} and ${max} ${unit}.`);

  // Photos: count, kinds, file type and size (FR-021)
  const pr = type.photoRules;
  const kinds = Array.isArray(input.photoKinds) ? input.photoKinds : [];
  const photoKinds = photos.map((_, i) => (typeof kinds[i] === 'string' ? (kinds[i] as string) : 'photo'));
  if (photos.length < pr.minPhotos) add('photos', `Add at least ${pr.minPhotos} photo${pr.minPhotos > 1 ? 's' : ''}.`);
  if (photos.length > pr.maxPhotos) add('photos', `Add no more than ${pr.maxPhotos} photos.`);
  photoKinds.forEach((k, i) => {
    if (!(PHOTO_KINDS as readonly string[]).includes(k)) add(`photos[${i}]`, `Unknown photo kind "${k}".`);
  });
  for (const needed of pr.neededKinds) {
    if (!photoKinds.includes(needed)) add('photos', `Add a "${needed}" photo.`);
  }
  photos.forEach((p, i) => {
    if (!ALLOWED_IMAGE_TYPES.includes(p.mimetype)) add(`photos[${i}]`, 'Photos must be JPEG, PNG or WEBP.');
    if (p.size > pr.maxSizeMB * 1024 * 1024) add(`photos[${i}]`, `Each photo must be under ${pr.maxSizeMB} MB.`);
  });

  if (errors.length) return { errors };
  return {
    errors,
    clean: {
      description,
      doneAt: doneAt as Date,
      location: { emirate, area },
      answers,
      amountValue: amountValue as number,
      photoKinds,
    },
  };
}

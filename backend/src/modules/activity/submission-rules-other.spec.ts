import { checkSubmission, RULES_VERSION, type SubmissionInput, type TypeRules } from './submission-rules.js';

const NOW = new Date('2026-11-26T10:00:00Z');
const other: TypeRules = {
  formFields: [
    { key: 'activityName', label: { en: 'Activity name' }, type: 'text', options: [], required: true, maxLength: 60 },
  ],
  amount: {
    optional: true,
    units: ['items', 'kg', 'bags', 'liters', 'kWh', 'm2', 'other'],
    unit: 'items',
    min: 0.01,
    max: 100000,
  },
  photoRules: { minPhotos: 1, maxPhotos: 6, neededKinds: ['photo'], maxSizeMB: 8 },
};
const fixed: TypeRules = { ...other, formFields: [], amount: { unit: 'trees', min: 1, max: 50 } };
const photo = { mimetype: 'image/jpeg', size: 1000 };
const valid = (over: SubmissionInput = {}): SubmissionInput => ({
  description: 'Collected mangrove seeds',
  doneAt: '2026-11-25T10:00:00Z',
  location: { source: 'manual', emirate: 'Abu Dhabi', area: '' },
  answers: { activityName: '  Mangrove seeds ' },
  photoKinds: ['photo'],
  ...over,
});
const codes = (input: SubmissionInput, t = other) =>
  checkSubmission(t, input, [photo], NOW).errors.map((e) => `${e.field}:${e.code}`);

describe('OTHER activity rules (CR-001, FR-018)', () => {
  it('is rules-3', () => expect(RULES_VERSION).toBe('rules-3'));

  it('accepts a name without a quantity; the name is trimmed and the amount is null', () => {
    const r = checkSubmission(other, valid(), [photo], NOW);
    expect(r.errors).toEqual([]);
    expect(r.clean?.answers).toEqual({ activityName: 'Mangrove seeds' });
    expect(r.clean?.amount).toBeNull();
  });

  it('accepts a quantity with an allowed unit', () => {
    const r = checkSubmission(other, valid({ amount: { value: '3', unit: 'bags' } }), [photo], NOW);
    expect(r.clean?.amount).toEqual({ value: 3, unit: 'bags' });
  });

  it('requires a non-blank name and limits it to 60 characters', () => {
    expect(codes(valid({ answers: { activityName: '   ' } }))).toEqual(['answers.activityName:answers.required']);
    expect(codes(valid({ answers: {} }))).toEqual(['answers.activityName:answers.required']);
    expect(codes(valid({ answers: { activityName: 'x'.repeat(61) } }))).toEqual([
      'answers.activityName:answers.tooLong',
    ]);
    expect(codes(valid({ answers: { activityName: 'x'.repeat(60) } }))).toEqual([]);
  });

  it('rejects a value without a unit, an unknown unit, a unit without a value, and out-of-range values', () => {
    expect(codes(valid({ amount: { value: 3 } }))).toEqual(['amount.unit:amount.unitRequired']);
    expect(codes(valid({ amount: { value: 3, unit: 'tons' } }))).toEqual(['amount.unit:amount.unitInvalid']);
    expect(codes(valid({ amount: { unit: 'kg' } }))).toEqual(['amount.value:amount.required']);
    expect(codes(valid({ amount: { value: 'x', unit: 'kg' } }))).toEqual(['amount.value:amount.required']);
    expect(codes(valid({ amount: { value: 0, unit: 'kg' } }))).toEqual(['amount.value:amount.outOfRange']);
    expect(codes(valid({ amount: { value: 100001, unit: 'kg' } }))).toEqual(['amount.value:amount.outOfRange']);
    expect(codes(valid({ amount: { value: 0.01, unit: 'kg' } }))).toEqual([]);
  });

  it('leaves existing types unchanged: amount required, unit comes from the type', () => {
    expect(codes(valid({ answers: {} }), fixed)).toEqual(['amount.value:amount.required']);
    const r = checkSubmission(fixed, valid({ answers: {}, amount: { value: 5, unit: 'ignored' } }), [photo], NOW);
    expect(r.clean?.amount).toEqual({ value: 5, unit: 'trees' });
  });
});

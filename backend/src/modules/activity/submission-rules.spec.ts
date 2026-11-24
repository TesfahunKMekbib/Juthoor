import { checkSubmission, type SubmissionInput, type TypeRules } from './submission-rules.js';

const NOW = new Date('2026-11-25T10:00:00Z');
const type: TypeRules = {
  formFields: [
    { key: 'count', label: { en: 'Count' }, type: 'number', options: [], required: true },
    { key: 'species', label: { en: 'Species' }, type: 'choice', options: ['palm', 'ghaf'], required: false },
    { key: 'note', label: { en: 'Note' }, type: 'text', options: [], required: false },
  ],
  amount: { unit: 'trees', min: 1, max: 50 },
  photoRules: { minPhotos: 1, maxPhotos: 2, neededKinds: [], maxSizeMB: 1 },
};
const photo = { mimetype: 'image/jpeg', size: 1000 };
const valid = (over: SubmissionInput = {}): SubmissionInput => ({
  description: ' Planted trees ',
  doneAt: '2026-11-24T10:00:00Z',
  location: { emirate: 'Dubai', area: ' Marina ' },
  answers: { count: '3' },
  amount: { value: 5 },
  photoKinds: ['photo'],
  ...over,
});
const fields = (input: SubmissionInput, photos = [photo], t = type) =>
  checkSubmission(t, input, photos, NOW).errors.map((e) => e.field);

describe('checkSubmission', () => {
  it('accepts a valid submission and cleans values (FR-018)', () => {
    const r = checkSubmission(type, valid(), [photo], NOW);
    expect(r.errors).toEqual([]);
    expect(r.clean).toMatchObject({
      description: 'Planted trees',
      location: { emirate: 'Dubai', area: 'Marina' },
      answers: { count: 3 },
      amountValue: 5,
      photoKinds: ['photo'],
    });
  });

  describe('description (FR-018)', () => {
    it('rejects missing description', () => expect(fields(valid({ description: '  ' }))).toContain('description'));
    it('rejects non-string description', () => expect(fields(valid({ description: 5 }))).toContain('description'));
    it('accepts exactly 500 chars', () => expect(fields(valid({ description: 'a'.repeat(500) }))).toEqual([]));
    it('rejects 501 chars', () => expect(fields(valid({ description: 'a'.repeat(501) }))).toContain('description'));
  });

  describe('date (FR-019)', () => {
    it('rejects a future occurrence date (FR-019)', () =>
      expect(fields(valid({ doneAt: '2026-11-26T10:00:00Z' }))).toContain('doneAt'));
    it('allows small clock skew (5 min) but not beyond (FR-019)', () => {
      expect(fields(valid({ doneAt: '2026-11-25T10:05:00Z' }))).toEqual([]);
      expect(fields(valid({ doneAt: '2026-11-25T10:05:01Z' }))).toContain('doneAt');
    });
    it('rejects missing or invalid date (FR-019)', () => {
      expect(fields(valid({ doneAt: undefined }))).toContain('doneAt');
      expect(fields(valid({ doneAt: 'nope' }))).toContain('doneAt');
    });
    it('accepts a numeric timestamp', () => expect(fields(valid({ doneAt: NOW.getTime() - 1000 }))).toEqual([]));
    // FR-019 also requires rejecting dates outside a linked campaign/challenge window; not implemented yet.
    it.todo('rejects a date outside the active window of a linked campaign or challenge (FR-019)');
  });

  describe('location (FR-020)', () => {
    it('rejects an unknown emirate (FR-020)', () =>
      expect(fields(valid({ location: { emirate: 'Riyadh' } }))).toContain('location.emirate'));
    it('rejects missing location (FR-020)', () =>
      expect(fields(valid({ location: 'x' }))).toContain('location.emirate'));
    it('rejects over-long area', () =>
      expect(fields(valid({ location: { emirate: 'Dubai', area: 'a'.repeat(101) } }))).toContain('location.area'));
    it('treats a non-string area as empty', () => {
      const r = checkSubmission(type, valid({ location: { emirate: 'Dubai', area: 3 } }), [photo], NOW);
      expect(r.clean?.location.area).toBe('');
    });
    // FR-020 requires validating against UAE geographic boundaries / geofence; only the emirate name is checked.
    it.todo('validates coordinates against UAE boundaries and program geofence (FR-020)');
  });

  describe('answers (FR-011, FR-018)', () => {
    it('requires required fields', () => expect(fields(valid({ answers: {} }))).toContain('answers.count'));
    it('treats blank string and null as empty', () => {
      expect(fields(valid({ answers: { count: '  ' } }))).toContain('answers.count');
      expect(fields(valid({ answers: { count: null } }))).toContain('answers.count');
    });
    it('skips optional empty fields', () => expect(fields(valid({ answers: { count: 1, note: '' } }))).toEqual([]));
    it('rejects non-numeric and negative numbers', () => {
      expect(fields(valid({ answers: { count: 'abc' } }))).toContain('answers.count');
      expect(fields(valid({ answers: { count: -1 } }))).toContain('answers.count');
    });
    it('accepts zero', () => expect(fields(valid({ answers: { count: 0 } }))).toEqual([]));
    it('validates choice options', () => {
      expect(fields(valid({ answers: { count: 1, species: 'oak' } }))).toContain('answers.species');
      expect(fields(valid({ answers: { count: 1, species: 4 } }))).toContain('answers.species');
      expect(fields(valid({ answers: { count: 1, species: 'palm' } }))).toEqual([]);
    });
    it('validates text fields', () => {
      expect(fields(valid({ answers: { count: 1, note: true } }))).toContain('answers.note');
      expect(fields(valid({ answers: { count: 1, note: 'a'.repeat(201) } }))).toContain('answers.note');
      const r = checkSubmission(type, valid({ answers: { count: 1, note: 7 } }), [photo], NOW);
      expect(r.clean?.answers.note).toBe('7');
    });
  });

  describe('amount (FR-018)', () => {
    it('accepts min and max boundaries', () => {
      expect(fields(valid({ amount: { value: 1 } }))).toEqual([]);
      expect(fields(valid({ amount: { value: 50 } }))).toEqual([]);
    });
    it('rejects below min and above max', () => {
      expect(fields(valid({ amount: { value: 0 } }))).toContain('amount.value');
      expect(fields(valid({ amount: { value: 51 } }))).toContain('amount.value');
    });
    it('rejects missing, non-numeric, blank amount', () => {
      expect(fields(valid({ amount: {} }))).toContain('amount.value');
      expect(fields(valid({ amount: { value: 'x' } }))).toContain('amount.value');
      expect(fields(valid({ amount: { value: ' ' } }))).toContain('amount.value');
      expect(fields(valid({ amount: undefined }))).toContain('amount.value');
    });
    it('accepts a numeric string', () => {
      const r = checkSubmission(type, valid({ amount: { value: '7' } }), [photo], NOW);
      expect(r.clean?.amountValue).toBe(7);
    });
  });

  describe('photos (FR-021)', () => {
    it('rejects fewer than min photos (singular and plural messages)', () => {
      const one = checkSubmission(type, valid(), [], NOW).errors.find((e) => e.field === 'photos');
      expect(one?.message).toBe('Add at least 1 photo.');
      const t2 = { ...type, photoRules: { ...type.photoRules, minPhotos: 2 } };
      const two = checkSubmission(t2, valid({ photoKinds: ['photo'] }), [photo], NOW);
      expect(two.errors.find((e) => e.field === 'photos')?.message).toBe('Add at least 2 photos.');
    });
    it('rejects more than max photos', () =>
      expect(fields(valid({ photoKinds: [] }), [photo, photo, photo])).toContain('photos'));
    it('defaults missing kinds to "photo"', () => {
      const r = checkSubmission(type, valid({ photoKinds: undefined }), [photo], NOW);
      expect(r.clean?.photoKinds).toEqual(['photo']);
    });
    it('rejects unknown kinds', () => expect(fields(valid({ photoKinds: ['video'] }))).toContain('photos[0]'));
    it('requires needed kinds', () => {
      const t = { ...type, photoRules: { ...type.photoRules, neededKinds: ['before', 'after'] } };
      expect(fields(valid({ photoKinds: ['before'] }), [photo], t)).toContain('photos');
      expect(fields(valid({ photoKinds: ['before', 'after'] }), [photo, photo], t)).toEqual([]);
    });
    it('accepts JPEG, PNG, WEBP; rejects others (FR-021)', () => {
      for (const m of ['image/jpeg', 'image/png', 'image/webp'])
        expect(fields(valid(), [{ mimetype: m, size: 10 }])).toEqual([]);
      expect(fields(valid(), [{ mimetype: 'image/gif', size: 10 }])).toContain('photos[0]');
      expect(fields(valid(), [{ mimetype: 'application/pdf', size: 10 }])).toContain('photos[0]');
    });
    it('enforces the size limit at the boundary (FR-021)', () => {
      const lim = 1024 * 1024;
      expect(fields(valid(), [{ mimetype: 'image/png', size: lim }])).toEqual([]);
      expect(fields(valid(), [{ mimetype: 'image/png', size: lim + 1 }])).toContain('photos[0]');
    });
  });

  it('uses the real clock when now is omitted', () => {
    expect(checkSubmission(type, valid({ doneAt: '2000-01-01T00:00:00Z' }), [photo]).errors).toEqual([]);
  });
});

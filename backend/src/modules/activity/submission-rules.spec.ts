import { checkSubmission, RULES_VERSION, type SubmissionInput, type TypeRules } from './submission-rules.js';

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
  location: { source: 'manual', emirate: 'Dubai', area: ' Marina ' },
  answers: { count: '3' },
  amount: { value: 5 },
  photoKinds: ['photo'],
  ...over,
});
const errs = (input: SubmissionInput, photos = [photo], t = type) => checkSubmission(t, input, photos, NOW).errors;
const fields = (input: SubmissionInput, photos = [photo], t = type) => errs(input, photos, t).map((e) => e.field);
/** Field + code pairs, so every failure is asserted by its stable code (NFR-016). */
const codes = (input: SubmissionInput, photos = [photo], t = type) =>
  errs(input, photos, t).map((e) => `${e.field}:${e.code}`);

describe('checkSubmission', () => {
  it('exposes a rules version for the audit trail (FR-054)', () => expect(RULES_VERSION).toMatch(/^rules-\d+$/));

  it('accepts a valid submission and cleans values (FR-018)', () => {
    const r = checkSubmission(type, valid(), [photo], NOW);
    expect(r.errors).toEqual([]);
    expect(r.clean).toMatchObject({
      description: 'Planted trees',
      location: { source: 'manual', emirate: 'Dubai', area: 'Marina' },
      answers: { count: 3 },
      amountValue: 5,
      photoKinds: ['photo'],
    });
  });

  describe('description (FR-018)', () => {
    it('truncates an echoed unknown photo kind to 20 characters (S1)', () => {
      const r = checkSubmission(type, valid({ photoKinds: ['x'.repeat(500)] }), [photo], NOW);
      const e = r.errors.find((x) => x.code === 'photos.kindUnknown');
      expect(e?.params).toEqual({ kind: 'x'.repeat(20) });
      expect(e?.message.length).toBeLessThan(60);
    });
    it('rejects missing description', () =>
      expect(codes(valid({ description: '  ' }))).toEqual(['description:description.required']));
    it('rejects non-string description', () =>
      expect(codes(valid({ description: 5 }))).toEqual(['description:description.required']));
    it('accepts exactly 500 chars', () => expect(fields(valid({ description: 'a'.repeat(500) }))).toEqual([]));
    it('rejects 501 chars with the limit as a param', () => {
      expect(errs(valid({ description: 'a'.repeat(501) }))).toEqual([
        expect.objectContaining({ field: 'description', code: 'description.tooLong', params: { max: 500 } }),
      ]);
    });
  });

  describe('date (FR-019)', () => {
    it('rejects a future occurrence date (FR-019)', () =>
      expect(codes(valid({ doneAt: '2026-11-26T10:00:00Z' }))).toEqual(['doneAt:doneAt.future']));
    it('allows small clock skew (5 min) but not beyond (FR-019)', () => {
      expect(fields(valid({ doneAt: '2026-11-25T10:05:00Z' }))).toEqual([]);
      expect(codes(valid({ doneAt: '2026-11-25T10:05:01Z' }))).toEqual(['doneAt:doneAt.future']);
    });
    it('rejects missing or invalid date (FR-019)', () => {
      expect(codes(valid({ doneAt: undefined }))).toEqual(['doneAt:doneAt.required']);
      expect(codes(valid({ doneAt: 'nope' }))).toEqual(['doneAt:doneAt.required']);
    });
    it('accepts a numeric timestamp', () => expect(fields(valid({ doneAt: NOW.getTime() - 1000 }))).toEqual([]));
    // FR-019 also requires rejecting dates outside a linked campaign/challenge window; not implemented yet.
    it.todo('rejects a date outside the active window of a linked campaign or challenge (FR-019)');
  });

  describe('location (FR-012, FR-020)', () => {
    it('rejects an unknown emirate for a manual location (FR-020)', () =>
      expect(codes(valid({ location: { source: 'manual', emirate: 'Riyadh' } }))).toEqual([
        'location.emirate:location.emirateInvalid',
      ]));
    it('rejects a missing or unknown source (FR-012)', () => {
      expect(codes(valid({ location: 'x' }))).toEqual(['location.source:location.sourceInvalid']);
      expect(codes(valid({ location: { source: 'gps', emirate: 'Dubai' } }))).toEqual([
        'location.source:location.sourceInvalid',
      ]);
      expect(codes(valid({ location: { emirate: 'Dubai' } }))).toEqual(['location.source:location.sourceInvalid']);
    });
    it('rejects over-long area', () =>
      expect(errs(valid({ location: { source: 'manual', emirate: 'Dubai', area: 'a'.repeat(101) } }))).toEqual([
        expect.objectContaining({ code: 'location.areaTooLong', params: { max: 100 } }),
      ]));
    it('treats a non-string area as empty', () => {
      const r = checkSubmission(
        type,
        valid({ location: { source: 'manual', emirate: 'Dubai', area: 3 } }),
        [photo],
        NOW,
      );
      expect(r.clean?.location.area).toBe('');
    });
    it('accepts valid device coordinates and keeps them for the in-memory geo lookup only (ADR-0006)', () => {
      const r = checkSubmission(
        type,
        valid({ location: { source: 'device', coordinates: { lat: 24.45, lng: 54.38 }, area: 'Al Reem' } }),
        [photo],
        NOW,
      );
      expect(r.errors).toEqual([]);
      expect(r.clean?.location).toEqual({
        source: 'device',
        emirate: null,
        area: 'Al Reem',
        coordinates: { lat: 24.45, lng: 54.38 },
      });
    });
    it.each([
      [{ lat: 91, lng: 54 }],
      [{ lat: 24, lng: 181 }],
      [{ lat: -91, lng: 0 }],
      [{ lat: '24', lng: '54' }],
      [{ lat: NaN, lng: 54 }],
      [{}],
      [undefined],
    ])('rejects invalid device coordinates %j', (coordinates) => {
      expect(codes(valid({ location: { source: 'device', coordinates } }))).toEqual([
        'location.coordinates:location.coordinatesInvalid',
      ]);
    });
    it('accepts coordinate boundaries', () =>
      expect(fields(valid({ location: { source: 'device', coordinates: { lat: 90, lng: -180 } } }))).toEqual([]));
    // The UAE boundary check (outsideUae) lives in the service via the geo provider and is tested in
    // activities.service.spec.ts, dataset-geo-boundary-provider.spec.ts and the e2e suite.
    // Program geofences need campaigns/challenges (FR-013), which are out of scope this phase.
    it.todo('validates coordinates against a linked program geofence (FR-020, deferred with FR-013)');
  });

  describe('answers (FR-011, FR-018)', () => {
    it('requires required fields, with the field key as param', () =>
      expect(errs(valid({ answers: {} }))).toEqual([
        expect.objectContaining({ field: 'answers.count', code: 'answers.required', params: { fieldKey: 'count' } }),
      ]));
    it('treats blank string and null as empty', () => {
      expect(codes(valid({ answers: { count: '  ' } }))).toEqual(['answers.count:answers.required']);
      expect(codes(valid({ answers: { count: null } }))).toEqual(['answers.count:answers.required']);
    });
    it('skips optional empty fields', () => expect(fields(valid({ answers: { count: 1, note: '' } }))).toEqual([]));
    it('rejects non-numeric and negative numbers', () => {
      expect(codes(valid({ answers: { count: 'abc' } }))).toEqual(['answers.count:answers.notNumber']);
      expect(codes(valid({ answers: { count: -1 } }))).toEqual(['answers.count:answers.notNumber']);
    });
    it('accepts zero', () => expect(fields(valid({ answers: { count: 0 } }))).toEqual([]));
    it('validates choice options', () => {
      expect(codes(valid({ answers: { count: 1, species: 'oak' } }))).toEqual([
        'answers.species:answers.invalidChoice',
      ]);
      expect(codes(valid({ answers: { count: 1, species: 4 } }))).toEqual(['answers.species:answers.invalidChoice']);
      expect(fields(valid({ answers: { count: 1, species: 'palm' } }))).toEqual([]);
    });
    it('validates text fields', () => {
      expect(fields(valid({ answers: { count: 1, note: true } }))).toContain('answers.note');
      expect(codes(valid({ answers: { count: 1, note: 'a'.repeat(201) } }))).toEqual(['answers.note:answers.tooLong']);
      const r = checkSubmission(type, valid({ answers: { count: 1, note: 7 } }), [photo], NOW);
      expect(r.clean?.answers.note).toBe('7');
    });
  });

  describe('amount (FR-018)', () => {
    it('accepts min and max boundaries', () => {
      expect(fields(valid({ amount: { value: 1 } }))).toEqual([]);
      expect(fields(valid({ amount: { value: 50 } }))).toEqual([]);
    });
    it('rejects below min and above max with min, max and unit as params', () => {
      for (const value of [0, 51]) {
        expect(errs(valid({ amount: { value } }))).toEqual([
          expect.objectContaining({
            field: 'amount.value',
            code: 'amount.outOfRange',
            params: { min: 1, max: 50, unit: 'trees' },
          }),
        ]);
      }
    });
    it('rejects missing, non-numeric, blank amount', () => {
      expect(codes(valid({ amount: {} }))).toEqual(['amount.value:amount.required']);
      expect(codes(valid({ amount: { value: 'x' } }))).toEqual(['amount.value:amount.required']);
      expect(codes(valid({ amount: { value: ' ' } }))).toEqual(['amount.value:amount.required']);
      expect(codes(valid({ amount: undefined }))).toEqual(['amount.value:amount.required']);
    });
    it('accepts a numeric string', () => {
      const r = checkSubmission(type, valid({ amount: { value: '7' } }), [photo], NOW);
      expect(r.clean?.amountValue).toBe(7);
    });
  });

  describe('photos (FR-021)', () => {
    it('rejects fewer than min photos, with the minimum as a param', () => {
      expect(errs(valid(), [])).toEqual([
        expect.objectContaining({ field: 'photos', code: 'photos.tooFew', params: { min: 1 } }),
      ]);
      const t2 = { ...type, photoRules: { ...type.photoRules, minPhotos: 2 } };
      const two = checkSubmission(t2, valid({ photoKinds: ['photo'] }), [photo], NOW);
      expect(two.errors).toEqual([expect.objectContaining({ code: 'photos.tooFew', params: { min: 2 } })]);
    });
    it('rejects more than max photos', () =>
      expect(errs(valid({ photoKinds: [] }), [photo, photo, photo])).toEqual([
        expect.objectContaining({ field: 'photos', code: 'photos.tooMany', params: { max: 2 } }),
      ]));
    it('defaults missing kinds to "photo"', () => {
      const r = checkSubmission(type, valid({ photoKinds: undefined }), [photo], NOW);
      expect(r.clean?.photoKinds).toEqual(['photo']);
    });
    it('rejects unknown kinds', () =>
      expect(errs(valid({ photoKinds: ['video'] }))).toEqual([
        expect.objectContaining({ field: 'photos[0]', code: 'photos.kindUnknown', params: { kind: 'video' } }),
      ]));
    it('requires needed kinds', () => {
      const t = { ...type, photoRules: { ...type.photoRules, neededKinds: ['before', 'after'] } };
      expect(errs(valid({ photoKinds: ['before'] }), [photo], t)).toEqual([
        expect.objectContaining({ field: 'photos', code: 'photos.kindMissing', params: { kind: 'after' } }),
      ]);
      expect(fields(valid({ photoKinds: ['before', 'after'] }), [photo, photo], t)).toEqual([]);
    });
    it('accepts JPEG, PNG, WEBP; rejects others (FR-021)', () => {
      for (const m of ['image/jpeg', 'image/png', 'image/webp'])
        expect(fields(valid(), [{ mimetype: m, size: 10 }])).toEqual([]);
      expect(codes(valid(), [{ mimetype: 'image/gif', size: 10 }])).toEqual(['photos[0]:photos.typeNotAllowed']);
      expect(codes(valid(), [{ mimetype: 'application/pdf', size: 10 }])).toEqual(['photos[0]:photos.typeNotAllowed']);
    });
    it('enforces the size limit at the boundary (FR-021)', () => {
      const lim = 1024 * 1024;
      expect(fields(valid(), [{ mimetype: 'image/png', size: lim }])).toEqual([]);
      expect(errs(valid(), [{ mimetype: 'image/png', size: lim + 1 }])).toEqual([
        expect.objectContaining({ field: 'photos[0]', code: 'photos.tooLarge', params: { maxMb: 1 } }),
      ]);
    });
  });

  it('reports every failure at once so the app can show all of them (FR-023)', () => {
    const r = checkSubmission(type, {}, [], NOW);
    expect(r.clean).toBeUndefined();
    expect(r.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining([
        'description.required',
        'doneAt.required',
        'location.sourceInvalid',
        'answers.required',
        'amount.required',
        'photos.tooFew',
      ]),
    );
  });

  it('uses the real clock when now is omitted', () => {
    expect(checkSubmission(type, valid({ doneAt: '2000-01-01T00:00:00Z' }), [photo]).errors).toEqual([]);
  });
});

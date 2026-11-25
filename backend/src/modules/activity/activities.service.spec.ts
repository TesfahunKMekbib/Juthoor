import { jest } from '@jest/globals';
import sharp from 'sharp';
import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Types } from 'mongoose';
import { createLocationCipher } from '../../common/config/app-config.js';
import { EventsService } from '../../common/events/events.service.js';
import type { GeoBoundaryProvider, LocateResult } from '../integration/geo/geo-boundary-provider.js';
import { SharpEvidenceSanitizer } from '../integration/image/sharp-evidence-sanitizer.js';
import { InMemoryPhotoStorage } from '../integration/storage/in-memory-photo-storage.js';
import { ActivitiesService } from './activities.service.js';

// Loosely typed mock factory so tests can set any return value.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mocks return arbitrary shapes
const mockFn = () => jest.fn<(...args: any[]) => any>();

const userId = new Types.ObjectId().toString();
const typeId = new Types.ObjectId();
const type = {
  _id: typeId,
  code: 'tree',
  category: 'planting',
  version: 1,
  status: 'published',
  name: { en: 'Tree', ar: 'Tree' },
  formFields: [],
  amount: { unit: 'trees', min: 1, max: 10 },
  photoRules: { minPhotos: 1, maxPhotos: 2, neededKinds: [], maxSizeMB: 1 },
};
const cipher = createLocationCipher('ab'.repeat(32));
let file: { originalname: string; mimetype: string; size: number; buffer: Buffer };
const jpeg = (withExif = false) => {
  const img = sharp({ create: { width: 16, height: 16, channels: 3, background: '#2a7' } }).jpeg();
  return (withExif ? img.withExif({ IFD0: { Copyright: 'secret-owner' } }) : img).toBuffer();
};
beforeAll(async () => {
  const buffer = await jpeg();
  file = { originalname: 'a.jpg', mimetype: 'image/jpeg', size: buffer.length, buffer };
});
const data = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    activityTypeId: String(typeId),
    description: 'Planted',
    doneAt: '2020-01-01T00:00:00Z',
    location: { source: 'manual', emirate: 'Dubai', area: '' },
    amount: { value: 2 },
    ...over,
  });

const chain = (result: unknown) => {
  const c: Record<string, jest.Mock> = {};
  c.lean = mockFn().mockResolvedValue(result);
  c.sort = mockFn().mockReturnValue(c);
  c.limit = mockFn().mockReturnValue(c);
  return c;
};
const storedActivity = (over: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  activityTypeId: typeId,
  status: 'submitted',
  description: 'Planted',
  doneAt: new Date(),
  locationEnc: cipher.encryptJson({ emirate: 'Dubai', area: 'Marina' }),
  answers: { x: 1 },
  amount: { value: 2, unit: 'trees' },
  photos: [],
  statusHistory: [],
  submittedAt: new Date(),
  ...over,
});

function setup() {
  const model = {
    findOne: mockFn(),
    find: mockFn(),
    create: mockFn(),
    findOneAndUpdate: mockFn(),
  };
  const types = { findById: mockFn().mockResolvedValue(type), findByIds: mockFn().mockResolvedValue([type]) };
  const photos = new InMemoryPhotoStorage();
  const events = new EventsService();
  const geo = { locate: jest.fn<(lat: number, lng: number) => LocateResult>().mockReturnValue('Dubai') };
  const publish = jest.spyOn(events, 'publish');
  // Mocks stand in for the Mongoose model and the types service; cast through unknown.
  const svc = new ActivitiesService(
    model as unknown as ConstructorParameters<typeof ActivitiesService>[0],
    types as unknown as ConstructorParameters<typeof ActivitiesService>[1],
    photos,
    events,
    geo as GeoBoundaryProvider,
    new SharpEvidenceSanitizer(),
    cipher,
  );
  return { model, types, photos, publish, svc, geo };
}

describe('ActivitiesService', () => {
  describe('submit', () => {
    it('returns the existing activity with created:false for a repeated submitKey (FR-015)', async () => {
      const { model, svc, photos, publish } = setup();
      model.findOne.mockReturnValue(chain(storedActivity()));
      const r = await svc.submit(userId, data(), [file], 'key-1');
      expect(r.created).toBe(false);
      expect(model.create).not.toHaveBeenCalled();
      expect(photos.files.size).toBe(0);
      expect(publish).not.toHaveBeenCalled();
    });

    it('creates once, stores photos and publishes ActivitySubmitted keyed by activityId (FR-015)', async () => {
      const { model, svc, photos, publish } = setup();
      model.findOne.mockReturnValue(chain(null));
      const rec = storedActivity();
      model.create.mockResolvedValue({ toObject: () => rec });
      const r = await svc.submit(userId, data(), [file], '  key-2 ');
      expect(r.created).toBe(true);
      expect(photos.files.size).toBe(1);
      expect(model.create).toHaveBeenCalledWith(expect.objectContaining({ submitKey: 'key-2', status: 'submitted' }));
      expect(publish).toHaveBeenCalledWith(
        'ActivitySubmitted',
        expect.objectContaining({ activityId: String(rec._id), activityTypeCode: 'tree' }),
      );
    });

    it('generates a submit key when none is given', async () => {
      const { model, svc } = setup();
      model.findOne.mockReturnValue(chain(null));
      model.create.mockResolvedValue({ toObject: () => storedActivity() });
      await svc.submit(userId, data(), [file]);
      expect(model.create).toHaveBeenCalledWith(
        expect.objectContaining({ submitKey: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
      );
    });

    it('rejects an invalid activity type id with 422 activityType.required', async () => {
      const { model, svc } = setup();
      model.findOne.mockReturnValue(chain(null));
      const p = svc.submit(userId, data({ activityTypeId: 'bad' }), [file], 'k');
      await expect(p).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(p).rejects.toMatchObject({ errors: [{ field: 'activityTypeId', code: 'activityType.required' }] });
    });

    it('rejects an unpublished activity type with 422', async () => {
      const { model, types, svc } = setup();
      model.findOne.mockReturnValue(chain(null));
      types.findById.mockResolvedValue({ ...type, status: 'draft' });
      const p = svc.submit(userId, data(), [file], 'k');
      await expect(p).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(p).rejects.toMatchObject({ errors: [{ code: 'activityType.unavailable' }] });
    });

    it('accepts a device location inside the UAE and stores only the encrypted emirate (FR-020, NFR-007)', async () => {
      const { model, svc, geo, publish } = setup();
      model.findOne.mockReturnValue(chain(null));
      model.create.mockResolvedValue({ toObject: () => storedActivity() });
      const loc = { source: 'device', coordinates: { lat: 24.4539, lng: 54.3773 }, area: 'Reem' };
      await svc.submit(userId, data({ location: loc }), [file], 'k');
      expect(geo.locate).toHaveBeenCalledWith(24.4539, 54.3773);
      const doc = model.create.mock.calls[0][0];
      const json = JSON.stringify(doc);
      expect(json).not.toContain('24.45');
      expect(json).not.toContain('54.37');
      expect(json).not.toContain('coordinates');
      expect(doc.location).toBeUndefined();
      expect(cipher.decryptJson(doc.locationEnc)).toEqual({ emirate: 'Dubai', area: 'Reem' });
      expect(JSON.stringify(publish.mock.calls)).not.toContain('24.45');
    });

    it('rejects a device location outside the UAE and stores nothing (FR-020, Q-E3)', async () => {
      const { model, svc, geo, photos } = setup();
      model.findOne.mockReturnValue(chain(null));
      geo.locate.mockReturnValue('outsideUae');
      const loc = { source: 'device', coordinates: { lat: 51.5, lng: -0.12 } };
      await expect(svc.submit(userId, data({ location: loc }), [file], 'k')).rejects.toMatchObject({
        errors: [{ code: 'location.outsideUae' }],
      });
      expect(model.create).not.toHaveBeenCalled();
      expect(photos.files.size).toBe(0);
    });

    it('rejects a spoofed MIME type: the bytes decide, not the header (FR-021)', async () => {
      const { model, svc, photos } = setup();
      model.findOne.mockReturnValue(chain(null));
      const fake = { originalname: 'x.jpg', mimetype: 'image/jpeg', size: 5, buffer: Buffer.from('<?php') };
      await expect(svc.submit(userId, data(), [fake], 'k')).rejects.toMatchObject({
        errors: [{ field: 'photos[0]', code: 'photos.typeNotAllowed' }],
      });
      expect(photos.files.size).toBe(0);
    });

    it('ignores a wrong client MIME type when the bytes are a real image (FR-021)', async () => {
      const { model, svc } = setup();
      model.findOne.mockReturnValue(chain(null));
      model.create.mockResolvedValue({ toObject: () => storedActivity() });
      const r = await svc.submit(userId, data(), [{ ...file, mimetype: 'application/octet-stream' }], 'k');
      expect(r.created).toBe(true);
    });

    it('reports an unreadable image as photos.unreadable (FR-021)', async () => {
      const { model, svc, photos } = setup();
      model.findOne.mockReturnValue(chain(null));
      const truncated = { ...file, buffer: file.buffer.subarray(0, 40), size: 40 };
      await expect(svc.submit(userId, data(), [truncated], 'k')).rejects.toMatchObject({
        errors: [{ field: 'photos[0]', code: 'photos.unreadable' }],
      });
      expect(photos.files.size).toBe(0);
    });

    it('rethrows unexpected sanitizer failures', async () => {
      const { model, svc } = setup();
      model.findOne.mockReturnValue(chain(null));
      jest.spyOn(SharpEvidenceSanitizer.prototype, 'sanitize').mockRejectedValueOnce(new Error('boom'));
      await expect(svc.submit(userId, data(), [file], 'k')).rejects.toThrow('boom');
    });

    it('stores a re-encoded copy without EXIF and with a generated name (NFR-007, NFR-008)', async () => {
      const { model, svc, photos } = setup();
      model.findOne.mockReturnValue(chain(null));
      model.create.mockResolvedValue({ toObject: () => storedActivity() });
      const withExif = await jpeg(true);
      expect((await sharp(withExif).metadata()).exif).toBeDefined();
      await svc.submit(
        userId,
        data(),
        [{ originalname: 'IMG_home_address.jpg', mimetype: 'image/jpeg', size: withExif.length, buffer: withExif }],
        'k',
      );
      const [saved] = [...photos.files.values()];
      expect((await sharp(saved.buffer).metadata()).exif).toBeUndefined();
      expect(saved.buffer.includes(Buffer.from('secret-owner'))).toBe(false);
      const doc = model.create.mock.calls[0][0];
      expect(doc.photos[0].fileName).toMatch(/^[0-9a-f-]{36}\.jpg$/);
      expect(JSON.stringify(doc)).not.toContain('IMG_home_address');
    });

    it('rejects a photo above the type size limit (FR-021)', async () => {
      const { model, svc, types } = setup();
      model.findOne.mockReturnValue(chain(null));
      types.findById.mockResolvedValue({ ...type, photoRules: { ...type.photoRules, maxSizeMB: 0.00001 } });
      await expect(svc.submit(userId, data(), [file], 'k')).rejects.toMatchObject({
        errors: [{ code: 'photos.tooLarge' }],
      });
    });

    it('rejects when the geo provider yields no emirate', async () => {
      const { model, svc, geo } = setup();
      model.findOne.mockReturnValue(chain(null));
      geo.locate.mockReturnValue(undefined as unknown as LocateResult);
      const loc = { source: 'device', coordinates: { lat: 24, lng: 54 } };
      await expect(svc.submit(userId, data({ location: loc }), [file], 'k')).rejects.toMatchObject({
        errors: [{ code: 'location.emirateInvalid' }],
      });
      expect(model.create).not.toHaveBeenCalled();
    });

    it('rejects rule violations with 422 field errors and stores nothing (FR-023)', async () => {
      const { model, svc, photos } = setup();
      model.findOne.mockReturnValue(chain(null));
      await expect(svc.submit(userId, data({ description: '' }), [file], 'k')).rejects.toMatchObject({
        response: {
          statusCode: 422,
          code: 'validation.failed',
          errors: [{ field: 'description', code: 'description.required' }],
        },
      });
      expect(photos.files.size).toBe(0);
    });

    it('removes stored photos when saving fails, and rethrows', async () => {
      const { model, svc, photos } = setup();
      model.findOne.mockReturnValue(chain(null));
      model.create.mockRejectedValue(new Error('db down'));
      await expect(svc.submit(userId, data(), [file], 'k')).rejects.toThrow('db down');
      expect(photos.files.size).toBe(0);
    });

    it('returns the winner on a concurrent duplicate (E11000) (FR-015)', async () => {
      const { model, svc, photos } = setup();
      model.findOne.mockReturnValueOnce(chain(null)).mockReturnValueOnce(chain(storedActivity()));
      model.create.mockRejectedValue({ code: 11000 });
      const r = await svc.submit(userId, data(), [file], 'k');
      expect(r.created).toBe(false);
      expect(photos.files.size).toBe(0);
    });

    it('rethrows E11000 when no winner is found', async () => {
      const { model, svc } = setup();
      model.findOne.mockReturnValue(chain(null));
      model.create.mockRejectedValue({ code: 11000 });
      await expect(svc.submit(userId, data(), [file], 'k')).rejects.toEqual({ code: 11000 });
    });
  });

  describe('parseData', () => {
    it('rejects missing data', async () => {
      await expect(setup().svc.submit(userId, undefined, [])).rejects.toBeInstanceOf(BadRequestException);
    });
    it.each(['{not json', '[]', '"str"', 'null'])('rejects invalid data %s', async (raw) => {
      await expect(setup().svc.submit(userId, raw, [])).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listForUser', () => {
    it('rejects an unknown status', async () => {
      await expect(setup().svc.listForUser(userId, 'bogus')).rejects.toBeInstanceOf(BadRequestException);
    });
    it('filters by a valid status and returns views', async () => {
      const { model, svc } = setup();
      model.find.mockReturnValue(chain([storedActivity({ status: 'accepted' })]));
      const list = await svc.listForUser(userId, 'accepted');
      expect(model.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }));
      expect(list).toHaveLength(1);
      expect(list[0].activityType.code).toBe('tree');
    });
    it('lists without a status filter', async () => {
      const { model, svc } = setup();
      model.find.mockReturnValue(chain([]));
      await svc.listForUser(userId);
      expect(model.find).toHaveBeenCalledWith(expect.not.objectContaining({ status: expect.anything() }));
    });
  });

  describe('getForUser', () => {
    it('404s for an invalid id', async () => {
      await expect(setup().svc.getForUser(userId, 'bad')).rejects.toBeInstanceOf(NotFoundException);
    });
    it('404s when not owned or not found (NFR-025)', async () => {
      const { model, svc } = setup();
      model.findOne.mockReturnValue(chain(null));
      await expect(svc.getForUser(userId, String(new Types.ObjectId()))).rejects.toBeInstanceOf(NotFoundException);
    });
    it('returns the decrypted location, owner photo url and reason codes only to the owner (NFR-009)', async () => {
      const { model, svc } = setup();
      const fileId = new Types.ObjectId();
      const rec = storedActivity({
        status: 'accepted',
        resultReasonCode: null,
        photos: [{ kind: 'photo', fileId, fileName: 'g.jpg', mimeType: 'image/jpeg', sizeBytes: 9 }],
      });
      model.findOne.mockReturnValue(chain(rec));
      const v = await svc.getForUser(userId, String(rec._id));
      expect(v.location).toEqual({ emirate: 'Dubai', area: 'Marina' });
      expect(v.photos[0].url).toBe(`/api/activities/${String(rec._id)}/photos/${String(fileId)}`);
      expect(v.acceptedAmount).toEqual({ value: 2, unit: 'trees' });
      expect(model.findOne.mock.calls[0][0]).toMatchObject({ userId: new Types.ObjectId(userId) });
    });
    it('returns a null location when decryption fails', async () => {
      const { model, svc } = setup();
      model.findOne.mockReturnValue(chain(storedActivity({ locationEnc: { v: 1, iv: 'a', tag: 'b', ct: 'c' } })));
      expect((await svc.getForUser(userId, String(new Types.ObjectId()))).location).toBeNull();
    });
    it('falls back to an Unknown type when the type is gone', async () => {
      const { model, types, svc } = setup();
      types.findById.mockRejectedValue(new NotFoundException());
      model.findOne.mockReturnValue(chain(storedActivity()));
      const v = await svc.getForUser(userId, String(new Types.ObjectId()));
      expect(v.activityType.name.en).toBe('Unknown');
      expect(v.answers[0].label).toEqual({ en: 'x', ar: 'x' });
    });
  });

  describe('getPhotoForUser (NFR-009, NFR-025)', () => {
    const fileId = new Types.ObjectId();
    it('returns the bytes to the owner', async () => {
      const { model, svc, photos } = setup();
      photos.files.set(String(fileId), {
        buffer: Buffer.from('img'),
        mimeType: 'image/jpeg',
        meta: { userId, kind: 'photo' },
      });
      model.findOne.mockReturnValue(chain(storedActivity()));
      const r = await svc.getPhotoForUser(userId, String(new Types.ObjectId()), String(fileId));
      expect(r.mimeType).toBe('image/jpeg');
      expect(model.findOne.mock.calls[0][0]).toMatchObject({
        userId: new Types.ObjectId(userId),
        'photos.fileId': fileId,
      });
    });
    it('404s for another owner, an unknown photo, bad ids, or a missing file', async () => {
      const { model, svc } = setup();
      model.findOne.mockReturnValue(chain(null));
      await expect(svc.getPhotoForUser(userId, String(new Types.ObjectId()), String(fileId))).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(svc.getPhotoForUser(userId, 'bad', String(fileId))).rejects.toBeInstanceOf(NotFoundException);
      await expect(svc.getPhotoForUser(userId, String(new Types.ObjectId()), 'bad')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      model.findOne.mockReturnValue(chain(storedActivity()));
      await expect(svc.getPhotoForUser(userId, String(new Types.ObjectId()), String(fileId))).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('decide / findWaiting', () => {
    const decided = (over: Record<string, unknown> = {}) =>
      storedActivity({ status: 'accepted', userId: new Types.ObjectId(), ...over });
    it('decides from submitted, then from pending_technical_processing, with the reason code in history (FR-028)', async () => {
      const { model, svc, publish } = setup();
      model.findOneAndUpdate.mockReturnValueOnce(chain(null)).mockReturnValueOnce(chain(decided()));
      const id = new Types.ObjectId();
      const r = await svc.decide(id, 'accepted', null);
      expect(r).not.toBeNull();
      expect(model.findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: id, status: 'submitted' });
      expect(model.findOneAndUpdate.mock.calls[1][0]).toEqual({ _id: id, status: 'pending_technical_processing' });
      expect(model.findOneAndUpdate.mock.calls[1][1].$push.statusHistory).toMatchObject({
        from: 'pending_technical_processing',
        to: 'accepted',
        reasonCode: null,
      });
      expect(publish.mock.calls.map((c) => c[0])).toEqual(['ActivityDecided', 'ActivityAccepted']);
      expect(publish.mock.calls[1][1]).toMatchObject({ activityTypeCode: 'tree', category: 'planting' });
    });
    it('decide changes only status fields, never the submitted details (FR-015, AC 5)', async () => {
      const { model, svc } = setup();
      model.findOneAndUpdate.mockReturnValueOnce(chain(decided()));
      await svc.decide(new Types.ObjectId(), 'rejected', 'verification.evidenceUnrelated');
      const update = model.findOneAndUpdate.mock.calls[0][1];
      expect(Object.keys(update).sort()).toEqual(['$push', '$set']);
      expect(Object.keys(update.$set).sort()).toEqual(['resultReasonCode', 'status']);
      expect(Object.keys(update.$push)).toEqual(['statusHistory']);
    });
    it('returns null and publishes nothing when another worker already decided (FR-015, FR-028)', async () => {
      const { model, svc, publish } = setup();
      model.findOneAndUpdate.mockReturnValue(chain(null));
      expect(await svc.decide(new Types.ObjectId(), 'rejected', 'verification.evidenceUnrelated')).toBeNull();
      expect(publish).not.toHaveBeenCalled();
    });
    it('publishes ActivityDecided but not ActivityAccepted for a non-accepted outcome (FR-046)', async () => {
      const { model, svc, publish } = setup();
      model.findOneAndUpdate.mockReturnValue(chain(decided({ status: 'rejected' })));
      await svc.decide(new Types.ObjectId(), 'rejected', 'verification.evidenceUnrelated');
      expect(publish.mock.calls.map((c) => c[0])).toEqual(['ActivityDecided']);
      expect(publish.mock.calls[0][1]).toMatchObject({
        status: 'rejected',
        reasonCode: 'verification.evidenceUnrelated',
      });
    });
    it('skips ActivityAccepted, logging only the id, when the type is gone', async () => {
      const { model, svc, publish, types } = setup();
      types.findById.mockRejectedValue(new Error('gone'));
      model.findOneAndUpdate.mockReturnValue(chain(decided()));
      await svc.decide(new Types.ObjectId(), 'accepted', null);
      expect(publish.mock.calls.map((c) => c[0])).toEqual(['ActivityDecided']);
    });
    it('markPending moves submitted once, then only updates the reason code (FR-028)', async () => {
      const { model, svc } = setup();
      const id = new Types.ObjectId();
      model.findOneAndUpdate.mockReturnValueOnce(chain(decided({ status: 'pending_technical_processing' })));
      expect(await svc.markPending(id, 'processing.retrying')).not.toBeNull();
      expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(model.findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: id, status: 'submitted' });
      model.findOneAndUpdate.mockReset();
      model.findOneAndUpdate.mockReturnValueOnce(chain(null)).mockReturnValueOnce(chain(null));
      expect(await svc.markPending(id, 'processing.failedPermanently')).toBeNull();
      expect(model.findOneAndUpdate.mock.calls[1][0]).toEqual({
        _id: id,
        status: 'pending_technical_processing',
        resultReasonCode: { $ne: 'processing.failedPermanently' },
      });
    });
    it('getForVerification returns what the worker needs, with the emirate and no coordinates', async () => {
      const { model, svc } = setup();
      expect(await svc.getForVerification('nope')).toBeNull();
      model.findOne.mockReturnValueOnce(chain(null));
      expect(await svc.getForVerification(String(new Types.ObjectId()))).toBeNull();
      model.findOne.mockReturnValueOnce(chain(storedActivity({ userId: new Types.ObjectId() })));
      const r = await svc.getForVerification(String(new Types.ObjectId()));
      expect(r).toMatchObject({ emirate: 'Dubai', status: 'submitted', amount: { value: 2, unit: 'trees' } });
      expect(JSON.stringify(r)).not.toContain('Marina');
      model.findOne.mockReturnValueOnce(
        chain(
          storedActivity({
            userId: new Types.ObjectId(),
            locationEnc: { v: 1, iv: 'x', tag: 'x', ct: 'x' },
            answers: undefined,
          }),
        ),
      );
      expect((await svc.getForVerification(String(new Types.ObjectId())))?.emirate).toBe('');
    });
    it('finds waiting activities oldest first', async () => {
      const { model, svc } = setup();
      const c = chain([]);
      model.find.mockReturnValue(c);
      await svc.findWaiting(new Date());
      expect(c.sort).toHaveBeenCalledWith({ submittedAt: 1 });
    });
  });
});

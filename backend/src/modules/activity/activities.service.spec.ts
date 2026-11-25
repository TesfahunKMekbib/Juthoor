import { jest } from '@jest/globals';
import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Types } from 'mongoose';
import { EventsService } from '../../common/events/events.service.js';
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
const file = { originalname: 'a.jpg', mimetype: 'image/jpeg', size: 3, buffer: Buffer.from([1, 2, 3]) };
const data = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    activityTypeId: String(typeId),
    description: 'Planted',
    doneAt: '2020-01-01T00:00:00Z',
    location: { emirate: 'Dubai', area: '' },
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
  location: { emirate: 'Dubai', area: '' },
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
  const publish = jest.spyOn(events, 'publish');
  // Mocks stand in for the Mongoose model and the types service; cast through unknown.
  const svc = new ActivitiesService(
    model as unknown as ConstructorParameters<typeof ActivitiesService>[0],
    types as unknown as ConstructorParameters<typeof ActivitiesService>[1],
    photos,
    events,
  );
  return { model, types, photos, publish, svc };
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

    it('rejects an invalid activity type id with 422', async () => {
      const { model, svc } = setup();
      model.findOne.mockReturnValue(chain(null));
      await expect(svc.submit(userId, data({ activityTypeId: 'bad' }), [file], 'k')).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('rejects an unpublished activity type with 422', async () => {
      const { model, types, svc } = setup();
      model.findOne.mockReturnValue(chain(null));
      types.findById.mockResolvedValue({ ...type, status: 'draft' });
      await expect(svc.submit(userId, data(), [file], 'k')).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects rule violations with 422 field errors and stores nothing (FR-023)', async () => {
      const { model, svc, photos } = setup();
      model.findOne.mockReturnValue(chain(null));
      await expect(svc.submit(userId, data({ description: '' }), [file], 'k')).rejects.toMatchObject({
        response: { statusCode: 422, errors: [{ field: 'description' }] },
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
    it('falls back to an Unknown type when the type is gone', async () => {
      const { model, types, svc } = setup();
      types.findById.mockRejectedValue(new NotFoundException());
      model.findOne.mockReturnValue(chain(storedActivity()));
      const v = await svc.getForUser(userId, String(new Types.ObjectId()));
      expect(v.activityType.name.en).toBe('Unknown');
      expect(v.answers[0].label).toEqual({ en: 'x', ar: 'x' });
    });
  });

  describe('decide / findWaiting', () => {
    it('only transitions from submitted', async () => {
      const { model, svc } = setup();
      model.findOneAndUpdate.mockReturnValue(chain(storedActivity({ status: 'accepted' })));
      const id = new Types.ObjectId();
      await svc.decide(id, 'accepted', 'ok');
      expect(model.findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: id, status: 'submitted' });
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

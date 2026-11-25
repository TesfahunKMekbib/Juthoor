import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Types, type Model } from 'mongoose';
import type { ActivityType } from './activity-type.schema.js';
import { ActivityTypesService } from './activity-types.service.js';

const id = new Types.ObjectId().toHexString();

/** Minimal Mongoose model stub: `findById(...).lean()` resolves to `doc`. */
function serviceReturning(doc: Record<string, unknown> | null) {
  const findById = jest.fn(() => ({ lean: () => Promise.resolve(doc) }));
  const model = { findById } as unknown as Model<ActivityType>;
  return { service: new ActivityTypesService(model), findById };
}

describe('ActivityTypesService.findPublishedById (FR-009)', () => {
  it('returns a published activity type', async () => {
    const { service } = serviceReturning({ _id: id, status: 'published', code: 'tree' });
    await expect(service.findPublishedById(id)).resolves.toMatchObject({ code: 'tree' });
  });

  it.each(['draft', 'archived'])('hides a %s activity type as not found', async (status) => {
    const { service } = serviceReturning({ _id: id, status, code: 'tree' });
    await expect(service.findPublishedById(id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a malformed id without querying the database', async () => {
    const { service, findById } = serviceReturning(null);
    await expect(service.findPublishedById('not-an-id')).rejects.toBeInstanceOf(NotFoundException);
    expect(findById).not.toHaveBeenCalled();
  });

  it('reports a missing activity type as not found', async () => {
    const { service } = serviceReturning(null);
    await expect(service.findPublishedById(id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

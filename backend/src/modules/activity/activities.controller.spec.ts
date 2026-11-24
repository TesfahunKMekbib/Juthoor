import { jest } from '@jest/globals';
import { BadRequestException, HttpException, NotFoundException, StreamableFile } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { ActivitiesController } from './activities.controller.js';
import type { ActivitiesService } from './activities.service.js';
import { TOO_MANY_FILES_MESSAGE, UploadErrorsInterceptor } from './upload-errors.interceptor.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- test mocks return arbitrary shapes
const mockFn = () => jest.fn<(...args: any[]) => any>();

const me = { participantId: 'p1' };
const photo = { fieldname: 'photos', originalname: 'a.jpg', mimetype: 'image/jpeg', size: 1, buffer: Buffer.from('a') };

function setup() {
  const service = {
    submit: mockFn(),
    listForUser: mockFn().mockResolvedValue([]),
    getForUser: mockFn().mockResolvedValue({ id: 'a1' }),
    getPhotoForUser: mockFn(),
  };
  const reply = { status: jest.fn() };
  return { service, reply, ctrl: new ActivitiesController(service as unknown as ActivitiesService) };
}

describe('ActivitiesController', () => {
  it('requires the Idempotency-Key header (FR-015)', async () => {
    const { ctrl, reply, service } = setup();
    for (const key of [undefined, '   ']) {
      await expect(ctrl.create(me, key, { data: '{}' }, [photo], reply)).rejects.toMatchObject({
        response: { code: 'request.idempotencyKeyMissing' },
      });
    }
    await expect(ctrl.create(me, 'k'.repeat(101), { data: '{}' }, [photo], reply)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.submit).not.toHaveBeenCalled();
  });

  it('answers 201 when created and 200 on a replay, owner from the participant only (FR-015, NFR-025)', async () => {
    const { ctrl, reply, service } = setup();
    service.submit.mockResolvedValueOnce({ created: true, activity: { id: 'a1' } });
    expect(await ctrl.create(me, ' key-1 ', { data: '{"x":1}' }, [photo], reply)).toEqual({ id: 'a1' });
    expect(reply.status).toHaveBeenLastCalledWith(201);
    expect(service.submit).toHaveBeenLastCalledWith('p1', '{"x":1}', [photo], 'key-1');

    service.submit.mockResolvedValueOnce({ created: false, activity: { id: 'a1' } });
    await ctrl.create(me, 'key-1', { data: '{"x":1}' }, [photo], reply);
    expect(reply.status).toHaveBeenLastCalledWith(200);
  });

  it('passes only files in the photos field and tolerates a missing body or files', async () => {
    const { ctrl, reply, service } = setup();
    service.submit.mockResolvedValue({ created: true, activity: {} });
    await ctrl.create(me, 'k', { data: 5 }, [photo, { ...photo, fieldname: 'other' }], reply);
    expect(service.submit).toHaveBeenLastCalledWith('p1', undefined, [photo], 'k');
    await ctrl.create(me, 'k', undefined, undefined, reply);
    expect(service.submit).toHaveBeenLastCalledWith('p1', undefined, [], 'k');
  });

  it('lists as { items } for the caller and forwards the status filter (FR-017)', async () => {
    const { ctrl, service } = setup();
    expect(await ctrl.list(me, 'accepted')).toEqual({ items: [] });
    expect(service.listForUser).toHaveBeenCalledWith('p1', 'accepted');
  });

  it('gets one activity scoped to the caller (NFR-025)', async () => {
    const { ctrl, service } = setup();
    await ctrl.get(me, 'a1');
    expect(service.getForUser).toHaveBeenCalledWith('p1', 'a1');
  });

  it('streams the photo to the owner and propagates 404 for anyone else (NFR-009)', async () => {
    const { ctrl, service } = setup();
    service.getPhotoForUser.mockResolvedValueOnce({ buffer: Buffer.from('x'), mimeType: 'image/png' });
    const out = await ctrl.photo(me, 'a1', 'f1');
    expect(out).toBeInstanceOf(StreamableFile);
    expect(out.getHeaders().type).toBe('image/png');
    service.getPhotoForUser.mockRejectedValueOnce(new NotFoundException());
    await expect(ctrl.photo({ participantId: 'other' }, 'a1', 'f1')).rejects.toBeInstanceOf(NotFoundException);
    expect(service.getPhotoForUser).toHaveBeenLastCalledWith('other', 'a1', 'f1');
  });

  it('sets private no-store headers on the photo route (NFR-009)', () => {
    const headers = Reflect.getMetadata('__headers__', ActivitiesController.prototype.photo) as {
      name: string;
      value: string;
    }[];
    expect(headers).toEqual(expect.arrayContaining([{ name: 'Cache-Control', value: 'private, no-store' }]));
  });
});

describe('UploadErrorsInterceptor', () => {
  const run = (err: unknown) =>
    new UploadErrorsInterceptor().intercept({} as never, { handle: () => throwError(() => err) }).toPromise();

  it('maps multer too-many-files to 422 photos.tooMany (FR-021)', async () => {
    await expect(run(new BadRequestException(TOO_MANY_FILES_MESSAGE))).rejects.toMatchObject({
      errors: [{ field: 'photos', code: 'photos.tooMany' }],
    });
  });
  it('leaves other errors, such as the 413 size cap, untouched', async () => {
    const tooLarge = new HttpException('File too large', 413);
    await expect(run(tooLarge)).rejects.toBe(tooLarge);
    const plain = new Error('x');
    await expect(run(plain)).rejects.toBe(plain);
  });
  it('passes successful responses through', async () => {
    const out = new UploadErrorsInterceptor().intercept({} as never, { handle: () => of(1) });
    await expect(out.toPromise()).resolves.toBe(1);
  });
});

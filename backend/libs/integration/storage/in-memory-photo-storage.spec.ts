import { Types } from 'mongoose';
import { InMemoryPhotoStorage } from './in-memory-photo-storage.js';

const file = { originalname: 'a.jpg', mimetype: 'image/jpeg', size: 3, buffer: Buffer.from([1, 2, 3]) };

describe('InMemoryPhotoStorage', () => {
  it('stores and reads a photo back', async () => {
    const s = new InMemoryPhotoStorage();
    const stored = await s.save(file, { userId: 'u', kind: 'photo' });
    expect(stored).toMatchObject({ fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 3 });
    const read = await s.read(stored.fileId);
    expect(read?.buffer).toEqual(file.buffer);
    expect(read?.mimeType).toBe('image/jpeg');
  });

  it('returns null for unknown ids', async () => {
    expect(await new InMemoryPhotoStorage().read(new Types.ObjectId())).toBeNull();
  });

  it('removes photos and ignores missing ones', async () => {
    const s = new InMemoryPhotoStorage();
    const { fileId } = await s.save(file, { userId: 'u', kind: 'photo' });
    await s.remove([fileId, new Types.ObjectId()]);
    expect(await s.read(fileId)).toBeNull();
    expect(s.files.size).toBe(0);
  });
});

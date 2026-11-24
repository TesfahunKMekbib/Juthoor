import { Types } from 'mongoose';
import type { PhotoStorage, PhotoToStore, StoredPhoto } from './photo-storage.js';

/** Test double for PhotoStorage. Keeps files in memory. */
export class InMemoryPhotoStorage implements PhotoStorage {
  readonly files = new Map<string, { buffer: Buffer; mimeType: string; meta: { userId: string; kind: string } }>();

  save(file: PhotoToStore, meta: { userId: string; kind: string }): Promise<StoredPhoto> {
    const fileId = new Types.ObjectId();
    this.files.set(String(fileId), { buffer: file.buffer, mimeType: file.mimetype, meta });
    return Promise.resolve({
      fileId,
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    });
  }

  remove(fileIds: Types.ObjectId[]): Promise<void> {
    for (const id of fileIds) this.files.delete(String(id));
    return Promise.resolve();
  }

  read(fileId: Types.ObjectId): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const f = this.files.get(String(fileId));
    return Promise.resolve(f ? { buffer: f.buffer, mimeType: f.mimeType } : null);
  }
}

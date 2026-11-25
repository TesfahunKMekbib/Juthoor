import type { Types } from 'mongoose';

/** Injection token for the photo storage provider (NFR-023). */
export const PHOTO_STORAGE = Symbol('PHOTO_STORAGE');

/** A file received from the upload, before it is stored. */
export interface PhotoToStore {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** What is kept on the activity after a photo is stored. */
export interface StoredPhoto {
  fileId: Types.ObjectId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface PhotoStorage {
  save(file: PhotoToStore, meta: { userId: string; kind: string }): Promise<StoredPhoto>;
  /** Deletes photos. Missing files are ignored. */
  remove(fileIds: Types.ObjectId[]): Promise<void>;
  /** Reads a stored photo, or null when it does not exist. */
  read(fileId: Types.ObjectId): Promise<{ buffer: Buffer; mimeType: string } | null>;
}

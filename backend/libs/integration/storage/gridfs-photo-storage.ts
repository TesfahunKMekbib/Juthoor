import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { type Connection, mongo, Types } from 'mongoose';
import type { PhotoStorage, PhotoToStore, StoredPhoto } from './photo-storage.js';

const BUCKET_NAME = 'activityPhotos';

/** Stores photos in MongoDB GridFS (Q-A8). */
@Injectable()
export class GridFsPhotoStorage implements PhotoStorage {
  private bucketInstance?: InstanceType<typeof mongo.GridFSBucket>;

  constructor(@InjectConnection() private readonly connection: Connection) {}

  private get bucket() {
    if (!this.bucketInstance) {
      if (!this.connection.db) throw new Error('Database connection is not ready');
      this.bucketInstance = new mongo.GridFSBucket(this.connection.db, { bucketName: BUCKET_NAME });
    }
    return this.bucketInstance;
  }

  async save(file: PhotoToStore, meta: { userId: string; kind: string }): Promise<StoredPhoto> {
    const upload = this.bucket.openUploadStream(file.originalname, {
      // mongodb 7 dropped the top-level contentType option; keep it in metadata.
      metadata: { userId: meta.userId, kind: meta.kind, contentType: file.mimetype },
    });
    await new Promise<void>((resolve, reject) => {
      upload.once('error', reject);
      upload.once('finish', () => resolve());
      upload.end(file.buffer);
    });
    return {
      fileId: new Types.ObjectId(String(upload.id)),
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
    };
  }

  async remove(fileIds: Types.ObjectId[]): Promise<void> {
    for (const id of fileIds) {
      try {
        await this.bucket.delete(new mongo.ObjectId(String(id)));
      } catch {
        // Already gone: nothing to clean up.
      }
    }
  }

  async read(fileId: Types.ObjectId): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const id = new mongo.ObjectId(String(fileId));
    const [info] = await this.bucket.find({ _id: id }).limit(1).toArray();
    if (!info) return null;
    const chunks: Buffer[] = [];
    for await (const chunk of this.bucket.openDownloadStream(id)) chunks.push(Buffer.from(chunk as Uint8Array));
    return {
      buffer: Buffer.concat(chunks),
      mimeType: (info.metadata?.contentType as string | undefined) ?? 'application/octet-stream',
    };
  }
}

import { Module } from '@nestjs/common';
import { GridFsPhotoStorage } from './gridfs-photo-storage.js';
import { PHOTO_STORAGE } from './photo-storage.js';

@Module({
  providers: [{ provide: PHOTO_STORAGE, useClass: GridFsPhotoStorage }],
  exports: [PHOTO_STORAGE],
})
export class StorageModule {}

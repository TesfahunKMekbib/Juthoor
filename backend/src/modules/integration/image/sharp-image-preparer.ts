import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import type { ImagePreparer, PreparedImage } from '../ai/image-prep.js';

const MAX_PIXELS = 50_000_000; // decompression-bomb guard

/**
 * Prepares photos for the model (ADR-0012 section 6, NFR-007/008, AC 31): applies EXIF orientation,
 * downscales to `maxPx` (never enlarges) and re-encodes as JPEG. No `withMetadata()`, so EXIF/GPS/XMP/ICC are dropped.
 */
@Injectable()
export class SharpImagePreparer implements ImagePreparer {
  async prepare(photos: readonly { mimeType: string; data: Uint8Array }[], maxPx: number): Promise<PreparedImage[]> {
    // Sequential on purpose: bounds peak memory per verification (security review S2-5).
    const out: PreparedImage[] = [];
    for (const photo of photos) {
      const data = await sharp(photo.data, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
        .rotate()
        .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      out.push({ mimeType: 'image/jpeg', data: new Uint8Array(data) });
    }
    return out;
  }
}

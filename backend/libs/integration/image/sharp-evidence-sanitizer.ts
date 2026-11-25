import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import {
  EvidenceRejectedError,
  type EvidenceSanitizer,
  type SanitizedEvidence,
  type SanitizeOptions,
} from './evidence-sanitizer.js';
import { detectImageType } from './image-signature.js';

const EXTENSION = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
const MAX_PIXELS = 50_000_000; // decompression-bomb guard

@Injectable()
export class SharpEvidenceSanitizer implements EvidenceSanitizer {
  async sanitize(input: Buffer, options: SanitizeOptions): Promise<SanitizedEvidence> {
    if (input.length > options.maxBytes) throw new EvidenceRejectedError('tooLarge');
    const type = detectImageType(input);
    if (!type) throw new EvidenceRejectedError('typeNotAllowed');

    try {
      // rotate() applies the EXIF orientation first. Output is written without withMetadata(), so
      // EXIF, GPS, XMP, IPTC and ICC profiles are not copied.
      let pipeline = sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).rotate();
      if (options.maxDimension) {
        pipeline = pipeline.resize({
          width: options.maxDimension,
          height: options.maxDimension,
          fit: 'inside',
          withoutEnlargement: true,
        });
      }
      const out =
        type === 'image/jpeg'
          ? pipeline.jpeg({ quality: 85 })
          : type === 'image/png'
            ? pipeline.png()
            : pipeline.webp({ quality: 85 });
      const { data, info } = await out.toBuffer({ resolveWithObject: true });
      return {
        buffer: data,
        mimeType: type,
        fileName: `${randomUUID()}.${EXTENSION[type]}`,
        sizeBytes: data.length,
        width: info.width,
        height: info.height,
      };
    } catch {
      throw new EvidenceRejectedError('unreadable');
    }
  }
}

/**
 * Port for preparing photos before they reach the model: downscale to `maxPx` and re-encode without
 * EXIF (ADR-0012 section 6, NFR-007/008, AC 31).
 * TODO(B7c/B9b): implement with sharp, reusing the code in integration/image (owned by another task).
 */
export interface PreparedImage {
  mimeType: string;
  data: Uint8Array;
}

export interface ImagePreparer {
  prepare(photos: readonly { mimeType: string; data: Uint8Array }[], maxPx: number): Promise<PreparedImage[]>;
}

export const IMAGE_PREPARER = Symbol('IMAGE_PREPARER');

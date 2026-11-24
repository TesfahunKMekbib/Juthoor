/** Injection token for the evidence sanitizer (NFR-023). */
export const EVIDENCE_SANITIZER = Symbol('EVIDENCE_SANITIZER');

/** Maps to the `photos.typeNotAllowed | tooLarge | unreadable` field codes. */
export type SanitizeFailure = 'typeNotAllowed' | 'tooLarge' | 'unreadable';

/** Thrown when an upload cannot be accepted as evidence. */
export class EvidenceRejectedError extends Error {
  constructor(public readonly code: SanitizeFailure) {
    super(`Evidence rejected: ${code}`);
  }
}

export interface SanitizedEvidence {
  buffer: Buffer;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Generated; never derived from the uploaded file name. */
  fileName: string;
  sizeBytes: number;
  width: number;
  height: number;
}

export interface SanitizeOptions {
  /** Input size limit in bytes (FR-021). */
  maxBytes: number;
  /** Longest side of the output; larger images are scaled down. */
  maxDimension?: number;
}

/** Re-encodes an uploaded image so it carries no metadata (EXIF/GPS/XMP) (FR-021, NFR-007, NFR-008). */
export interface EvidenceSanitizer {
  /** @throws EvidenceRejectedError */
  sanitize(input: Buffer, options: SanitizeOptions): Promise<SanitizedEvidence>;
}

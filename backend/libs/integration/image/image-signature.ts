export type DetectedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const ascii = (buf: Uint8Array, from: number, to: number) => String.fromCharCode(...buf.subarray(from, to));

/**
 * Detects the image format from the file's leading bytes. The client-supplied MIME type and file
 * name are never consulted (FR-021). Returns null when the bytes are not an allowed image.
 */
export function detectImageType(buf: Uint8Array): DetectedImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && PNG_SIGNATURE.every((b, i) => buf[i] === b)) return 'image/png';
  if (buf.length >= 12 && ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

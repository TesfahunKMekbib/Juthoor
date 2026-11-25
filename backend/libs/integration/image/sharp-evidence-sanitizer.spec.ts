import sharp from 'sharp';
import { EvidenceRejectedError } from './evidence-sanitizer.js';
import { SharpEvidenceSanitizer } from './sharp-evidence-sanitizer.js';

const sanitizer = new SharpEvidenceSanitizer();
const raw = { create: { width: 40, height: 20, channels: 3 as const, background: { r: 10, g: 120, b: 30 } } };
const GPS = {
  IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '24/1 27/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '54/1 22/1 0/1' },
};
const OPTS = { maxBytes: 1024 * 1024 };

const jpegWithGps = () =>
  sharp(raw)
    .jpeg()
    .withExif({ IFD0: { Copyright: 'secret-owner' }, ...GPS })
    .toBuffer();

describe('SharpEvidenceSanitizer (FR-021, NFR-008)', () => {
  it('fixture really contains EXIF with GPS', async () => {
    const meta = await sharp(await jpegWithGps()).metadata();
    expect(meta.exif).toBeDefined();
    expect(meta.exif?.includes(Buffer.from('secret-owner'))).toBe(true);
  });

  it('strips EXIF/GPS and generates a file name', async () => {
    const res = await sanitizer.sanitize(await jpegWithGps(), OPTS);
    const meta = await sharp(res.buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(res.buffer.includes(Buffer.from('secret-owner'))).toBe(false);
    expect(res.mimeType).toBe('image/jpeg');
    expect(res.fileName).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(res.sizeBytes).toBe(res.buffer.length);
    expect([res.width, res.height]).toEqual([40, 20]);
  });

  it('handles PNG and WEBP', async () => {
    const png = await sanitizer.sanitize(await sharp(raw).png().toBuffer(), OPTS);
    expect(png.mimeType).toBe('image/png');
    expect(png.fileName.endsWith('.png')).toBe(true);
    const webp = await sanitizer.sanitize(await sharp(raw).webp().toBuffer(), OPTS);
    expect(webp.mimeType).toBe('image/webp');
    expect(webp.fileName.endsWith('.webp')).toBe(true);
  });

  it('applies EXIF orientation before stripping it', async () => {
    const rotated = await sharp(raw).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const res = await sanitizer.sanitize(rotated, OPTS);
    expect([res.width, res.height]).toEqual([20, 40]);
    expect((await sharp(res.buffer).metadata()).orientation).toBeUndefined();
  });

  it('scales down to maxDimension but never up', async () => {
    const big = await sharp({ create: { width: 400, height: 200, channels: 3, background: '#ffffff' } })
      .png()
      .toBuffer();
    const down = await sanitizer.sanitize(big, { ...OPTS, maxDimension: 100 });
    expect([down.width, down.height]).toEqual([100, 50]);
    const same = await sanitizer.sanitize(big, { ...OPTS, maxDimension: 1000 });
    expect(same.width).toBe(400);
  });

  it('rejects spoofed files (text bytes) as typeNotAllowed', async () => {
    await expect(sanitizer.sanitize(Buffer.from('<?php echo 1; ?> photo.jpg'), OPTS)).rejects.toMatchObject({
      code: 'typeNotAllowed',
    });
  });

  it('rejects input over the size limit', async () => {
    const img = await sharp(raw).png().toBuffer();
    await expect(sanitizer.sanitize(img, { maxBytes: img.length - 1 })).rejects.toMatchObject({ code: 'tooLarge' });
    await expect(sanitizer.sanitize(img, { maxBytes: img.length })).resolves.toBeDefined();
  });

  it('rejects a valid signature with corrupt content as unreadable', async () => {
    const img = await sharp(raw).jpeg().toBuffer();
    const corrupt = Buffer.concat([img.subarray(0, 20), Buffer.alloc(30, 7)]);
    const err = await sanitizer.sanitize(corrupt, OPTS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EvidenceRejectedError);
    expect((err as EvidenceRejectedError).code).toBe('unreadable');
  });

  it('does not reuse file names', async () => {
    const img = await sharp(raw).png().toBuffer();
    const [a, b] = await Promise.all([sanitizer.sanitize(img, OPTS), sanitizer.sanitize(img, OPTS)]);
    expect(a.fileName).not.toBe(b.fileName);
  });
});

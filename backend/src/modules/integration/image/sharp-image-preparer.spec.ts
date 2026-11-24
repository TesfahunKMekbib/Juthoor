import sharp from 'sharp';
import { SharpImagePreparer } from './sharp-image-preparer.js';

const make = (w: number, h: number, format: 'png' | 'jpeg' = 'jpeg', withExif = false): Promise<Buffer> => {
  let p = sharp({ create: { width: w, height: h, channels: 3, background: '#3a7' } });
  if (withExif) p = p.withExif({ IFD0: { Copyright: 'secret-owner' } });
  return (format === 'png' ? p.png() : p.jpeg()).toBuffer();
};

describe('SharpImagePreparer (AC 31, NFR-007/008)', () => {
  const prep = new SharpImagePreparer();

  it('downscales to maxPx keeping aspect ratio and re-encodes as JPEG', async () => {
    const [out] = await prep.prepare([{ mimeType: 'image/png', data: await make(400, 200, 'png') }], 100);
    const meta = await sharp(out!.data).metadata();
    expect(out!.mimeType).toBe('image/jpeg');
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);
  });

  it('does not enlarge small images', async () => {
    const [out] = await prep.prepare([{ mimeType: 'image/jpeg', data: await make(40, 30) }], 100);
    const meta = await sharp(out!.data).metadata();
    expect([meta.width, meta.height]).toEqual([40, 30]);
  });

  it('strips EXIF metadata', async () => {
    const input = await make(64, 64, 'jpeg', true);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const [out] = await prep.prepare([{ mimeType: 'image/jpeg', data: input }], 64);
    expect((await sharp(out!.data).metadata()).exif).toBeUndefined();
  });

  it('prepares several photos in order and rejects unreadable data', async () => {
    const outs = await prep.prepare(
      [
        { mimeType: 'image/jpeg', data: await make(200, 100) },
        { mimeType: 'image/jpeg', data: await make(100, 200) },
      ],
      50,
    );
    expect(outs).toHaveLength(2);
    expect((await sharp(outs[0]!.data).metadata()).width).toBe(50);
    expect((await sharp(outs[1]!.data).metadata()).height).toBe(50);
    await expect(prep.prepare([{ mimeType: 'image/jpeg', data: new Uint8Array([1, 2]) }], 50)).rejects.toThrow();
  });
});

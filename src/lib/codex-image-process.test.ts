import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processCodexImage } from './codex-image-process';

function canvas(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } } });
}

async function rotatedPngWithGps(): Promise<Buffer> {
  const png = await canvas(3000, 2000)
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Software: 'Fixture Camera 1.0' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' },
    })
    .png()
    .toBuffer();
  const metadata = await sharp(png).metadata();
  expect(metadata.orientation).toBe(6);
  expect(metadata.exif?.toString('latin1')).toContain('Fixture Camera');
  return png;
}

describe('processCodexImage', () => {
  it('rotates by EXIF, strips metadata, and writes three WebP widths', async () => {
    const input = await rotatedPngWithGps();

    const result = await processCodexImage(input);

    if (!result.ok) throw new Error(result.reason);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(2880);
    expect(result.sha256).toBe(createHash('sha256').update(input).digest('hex'));
    expect(result.variants.map((variant) => variant.width)).toEqual([640, 1280, 1920]);
    const metadata = await Promise.all(result.variants.map((variant) => sharp(variant.webp).metadata()));
    expect(metadata.map((entry) => entry.format)).toEqual(['webp', 'webp', 'webp']);
    expect(metadata.map((entry) => entry.width)).toEqual([640, 1280, 1920]);
    expect(metadata.map((entry) => entry.height)).toEqual([960, 1920, 2880]);
    for (const entry of metadata) {
      expect([entry.exif, entry.icc, entry.xmp]).toEqual([undefined, undefined, undefined]);
    }
    expect(result.variants[1]!.webp.byteLength).toBeLessThan(300_000);
  });

  it('never enlarges a small screenshot', async () => {
    const result = await processCodexImage(await canvas(400, 300).png().toBuffer());

    if (!result.ok) throw new Error(result.reason);
    expect([result.width, result.height]).toEqual([400, 300]);
    const widths = await Promise.all(result.variants.map(async (variant) => (await sharp(variant.webp).metadata()).width));
    expect(widths).toEqual([400, 400, 400]);
  });

  it('refuses bytes that are not an image', async () => {
    expect(await processCodexImage(new TextEncoder().encode('%PDF-1.4\n1 0 obj\n'))).toEqual({
      ok: false,
      reason: 'not-image',
    });
  });

  it('refuses an image over the pixel limit before decoding it', async () => {
    const huge = await canvas(9000, 9000).png({ compressionLevel: 9 }).toBuffer();

    expect(await processCodexImage(huge)).toEqual({ ok: false, reason: 'too-many-pixels' });
  });
});

import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { CODEX_IMAGE_WIDTHS, type CodexImageWidth } from '@/lib/eve-image';

const MAX_INPUT_PIXELS = 24_000_000;
const WEBP_QUALITY = 82;
const DECODABLE_FORMATS = new Set(['png', 'jpeg', 'webp']);

export interface CodexImageVariant {
  readonly width: CodexImageWidth;
  readonly webp: Buffer;
}

export type CodexImageProcessResult =
  | {
      readonly ok: true;
      readonly sha256: string;
      readonly width: number;
      readonly height: number;
      readonly variants: readonly CodexImageVariant[];
    }
  | { readonly ok: false; readonly reason: 'not-image' | 'too-many-pixels' };

const decoder = (bytes: Uint8Array) => sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });

async function inspect(bytes: Uint8Array): Promise<'ok' | 'not-image' | 'too-many-pixels'> {
  try {
    const { format, width, height } = await sharp(bytes, { limitInputPixels: false }).metadata();
    if (!DECODABLE_FORMATS.has(format)) return 'not-image';
    return width * height > MAX_INPUT_PIXELS ? 'too-many-pixels' : 'ok';
  } catch {
    return 'not-image';
  }
}

async function encodeVariant(bytes: Uint8Array, width: CodexImageWidth) {
  const { data, info } = await decoder(bytes)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
  return { width, webp: data, size: { width: info.width, height: info.height } };
}

export async function processCodexImage(bytes: Uint8Array): Promise<CodexImageProcessResult> {
  const verdict = await inspect(bytes);
  if (verdict !== 'ok') return { ok: false, reason: verdict };
  try {
    const encoded = await Promise.all(CODEX_IMAGE_WIDTHS.map((width) => encodeVariant(bytes, width)));
    const largest = encoded.at(-1)!.size;
    return {
      ok: true,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      width: largest.width,
      height: largest.height,
      variants: encoded.map(({ width, webp }) => ({ width, webp })),
    };
  } catch {
    return { ok: false, reason: 'not-image' };
  }
}

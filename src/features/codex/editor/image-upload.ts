import { uploadCodexBlob } from '@/lib/codex-blob-client';
import { apiFetch } from '@/transport/api-client';
import { codexUploadFinalizeEndpoint, codexUploadTokenEndpoint, type CodexUploadedAsset } from '../api-contract';
import { CODEX_UPLOAD_CONTENT_TYPES, CODEX_UPLOAD_MAX_BYTES } from '../constants';

const MAX_EDGE = 2560;
const WEBP_QUALITY = 0.85;
const NOT_AN_IMAGE = 'That file is not an image.';

export type ImageUploadState =
  | { readonly phase: 'idle' | 'shrinking' | 'uploading' | 'finalizing' }
  | { readonly phase: 'failed'; readonly message: string };

export function shrinkTarget(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const ALLOWED_TYPES: ReadonlySet<string> = new Set(CODEX_UPLOAD_CONTENT_TYPES);

export function imageFileFrom(data: Pick<DataTransfer, 'files'> | null): File | null {
  return [...(data?.files ?? [])].find((file) => ALLOWED_TYPES.has(file.type)) ?? null;
}

type Shrunk = { readonly ok: true; readonly blob: Blob; readonly ext: 'webp' | 'png' } | { readonly ok: false; readonly message: string };

async function shrinkImage(file: Blob): Promise<Shrunk> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return { ok: false, message: NOT_AN_IMAGE };
  }
  const size = shrinkTarget(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(size.width, size.height);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const webp = await canvas.convertToBlob({ type: 'image/webp', quality: WEBP_QUALITY });
  if (webp.type === 'image/webp') return { ok: true, blob: webp, ext: 'webp' };
  return { ok: true, blob: await canvas.convertToBlob({ type: 'image/png' }), ext: 'png' };
}

export type UploadOutcome = { readonly ok: true; readonly asset: CodexUploadedAsset } | { readonly ok: false; readonly message: string };

export async function uploadCodexImage(
  file: Blob,
  prefix: string,
  onPhase: (phase: 'shrinking' | 'uploading' | 'finalizing') => void,
): Promise<UploadOutcome> {
  onPhase('shrinking');
  const shrunk = await shrinkImage(file);
  if (!shrunk.ok) return shrunk;
  if (shrunk.blob.size > CODEX_UPLOAD_MAX_BYTES) return { ok: false, message: 'Images can be at most 8 MB.' };
  onPhase('uploading');
  let url: string;
  try {
    url = await uploadCodexBlob(`${prefix}${crypto.randomUUID()}.${shrunk.ext}`, shrunk.blob, codexUploadTokenEndpoint.path);
  } catch {
    return { ok: false, message: 'The image did not upload. You may have reached the daily limit of 20; try again later.' };
  }
  onPhase('finalizing');
  const result = await apiFetch(codexUploadFinalizeEndpoint, { body: { url } });
  if (result.ok) return { ok: true, asset: result.data.asset };
  const detail = result.kind === 'api' ? result.error.detail : undefined;
  return { ok: false, message: detail ?? 'The image did not upload. Try again.' };
}

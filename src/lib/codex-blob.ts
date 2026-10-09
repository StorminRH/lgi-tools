import { del, list, put } from '@vercel/blob';
import {
  issueCodexUploadToken,
  type CodexUploadBody,
  type CodexUploadTokenOptions,
} from '@/lib/codex-blob-client';
import { readEnv } from '@/lib/env';
import type { CodexImageWidth } from '@/lib/eve-image';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

const BLOB_TIMEOUT_MS = 30_000;
const ONE_YEAR_SECONDS = 31_536_000;
const BLOB_HOST_SUFFIX = '.public.blob.vercel-storage.com';
const PENDING_FILE = /^[0-9a-f-]{36}\.(webp|png|jpe?g)$/;
const UPLOADED_PENDING_FILE = /^[0-9a-f-]{36}(-[A-Za-z0-9]+)?\.(webp|png|jpe?g)$/;

export function codexBlobEnv(): string {
  return readEnv('VERCEL_TARGET_ENV') || readEnv('VERCEL_ENV') || 'local';
}

const envPrefix = (env: string) => `codex/${env}/`;

export function pendingPrefix(env: string, userId: string): string {
  return `${envPrefix(env)}pending/${userId}/`;
}

export function variantKey(env: string, assetId: string, width: CodexImageWidth): string {
  return `${envPrefix(env)}img/${assetId}-${width}.webp`;
}

export function variantStem(url: string): string {
  return url.replace(/-\d+\.webp$/, '');
}

export function isAllowedUploadPathname(pathname: string, prefix: string): boolean {
  return pathname.startsWith(prefix) && PENDING_FILE.test(pathname.slice(prefix.length));
}

export type PendingUrl =
  | { readonly ok: true; readonly pathname: string }
  | { readonly ok: false; readonly reason: 'not-https' | 'wrong-host' | 'wrong-prefix' };

export function parsePendingUrl(url: string, prefix: string, storeHost: string): PendingUrl {
  if (!URL.canParse(url)) return { ok: false, reason: 'not-https' };
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'not-https' };
  if (parsed.hostname !== storeHost || parsed.port !== '') return { ok: false, reason: 'wrong-host' };
  const pathname = parsed.pathname.slice(1);
  if (!pathname.startsWith(prefix) || !UPLOADED_PENDING_FILE.test(pathname.slice(prefix.length))) {
    return { ok: false, reason: 'wrong-prefix' };
  }
  return { ok: true, pathname };
}

function blobToken(): string | null {
  return readEnv('BLOB_READ_WRITE_TOKEN') || null;
}

export function codexBlobStoreHost(): string | null {
  const storeId = blobToken()?.split('_')[3];
  return storeId ? `${storeId.toLowerCase()}${BLOB_HOST_SUFFIX}` : null;
}

const blobOptions = (token: string) => ({ token, abortSignal: AbortSignal.timeout(BLOB_TIMEOUT_MS) });

export type CodexUploadToken =
  | { readonly status: 'issued'; readonly type: string; readonly clientToken: string }
  | { readonly status: 'unconfigured' };

export async function issueCodexUpload(
  request: Request,
  body: CodexUploadBody,
  options: CodexUploadTokenOptions,
): Promise<CodexUploadToken> {
  const token = blobToken();
  if (token === null) return { status: 'unconfigured' };
  return { status: 'issued', ...(await issueCodexUploadToken({ request, body, token, options })) };
}

export type CodexBlobDownload =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly reason: 'missing' | 'too-large' };

export interface CodexBlobPort {
  download(url: string, maxBytes: number): Promise<CodexBlobDownload>;
  putVariant(key: string, bytes: Uint8Array): Promise<string>;
  remove(urls: readonly string[]): Promise<void>;
  listPending(): AsyncIterable<{ readonly url: string; readonly uploadedAt: Date }>;
}

async function readCapped(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function download(url: string, maxBytes: number): Promise<CodexBlobDownload> {
  const response = await fetchWithTimeout(url, { cache: 'no-store' }, BLOB_TIMEOUT_MS);
  if (!response.ok) return { ok: false, reason: 'missing' };
  if (Number(response.headers.get('content-length') ?? 0) > maxBytes) {
    await response.body?.cancel();
    return { ok: false, reason: 'too-large' };
  }
  const bytes = await readCapped(response, maxBytes);
  return bytes === null ? { ok: false, reason: 'too-large' } : { ok: true, bytes };
}

function requireToken(): string {
  const token = blobToken();
  if (token === null) throw new Error('BLOB_READ_WRITE_TOKEN is not set');
  return token;
}

async function putVariant(key: string, bytes: Uint8Array): Promise<string> {
  const result = await put(key, Buffer.from(bytes), {
    ...blobOptions(requireToken()),
    access: 'public',
    contentType: 'image/webp',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: ONE_YEAR_SECONDS,
  });
  return result.url;
}

function inThisEnvironment(url: string): boolean {
  if (!URL.canParse(url)) return false;
  const { hostname, pathname } = new URL(url);
  return hostname === codexBlobStoreHost() && pathname.startsWith(`/${envPrefix(codexBlobEnv())}`);
}

async function remove(urls: readonly string[]): Promise<void> {
  const owned = urls.filter(inThisEnvironment);
  if (owned.length > 0) await del(owned, blobOptions(requireToken()));
}

async function* listBlobs(prefix: string) {
  const token = requireToken();
  let cursor: string | undefined;
  do {
    const page = await list({ ...blobOptions(token), prefix, cursor });
    yield* page.blobs;
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
}

async function* listPending() {
  if (blobToken() === null) return;
  for await (const blob of listBlobs(`${envPrefix(codexBlobEnv())}pending/`)) {
    yield { url: blob.url, uploadedAt: blob.uploadedAt };
  }
}

export function codexBlobConfigured(): boolean {
  return blobToken() !== null;
}

export const defaultBlobPort: CodexBlobPort = { download, putVariant, remove, listPending };

export async function sumCodexBlobBytes(): Promise<number | null> {
  if (!codexBlobConfigured()) return null;
  let total = 0;
  for await (const blob of listBlobs(envPrefix(codexBlobEnv()))) total += blob.size;
  return total;
}

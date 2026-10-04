import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  defaultBlobPort,
  isAllowedUploadPathname,
  parsePendingUrl,
  pendingPrefix,
  variantKey,
  variantStem,
} from './codex-blob';

const HOST = 's.public.blob.vercel-storage.com';
const FILE = '0b9a3c1e-6f0d-4b55-9e0e-2f8c1d7a9b10';

describe('Codex blob keys', () => {
  it('prefixes every key with its environment', () => {
    expect(pendingPrefix('local', 'u1')).toBe('codex/local/pending/u1/');
    expect(variantKey('production', 'aaaaaaaa-0000-4000-8000-000000000001', 1280)).toBe(
      'codex/production/img/aaaaaaaa-0000-4000-8000-000000000001-1280.webp',
    );
  });

  it('turns a variant URL into the stem the loader appends widths to', () => {
    expect(variantStem(`https://${HOST}/codex/local/img/ab12-1920.webp`)).toBe(`https://${HOST}/codex/local/img/ab12`);
  });
});

describe('parsePendingUrl', () => {
  const prefix = pendingPrefix('local', 'u1');

  it('accepts an upload under the uploader prefix, random suffix included', () => {
    expect(parsePendingUrl(`https://${HOST}/${prefix}${FILE}-Xy12AbC.webp`, prefix, HOST)).toEqual({
      ok: true,
      pathname: `${prefix}${FILE}-Xy12AbC.webp`,
    });
  });

  it.each([
    [`http://${HOST}/${prefix}${FILE}.webp`, 'not-https'],
    [`https://evil.example/${prefix}${FILE}.webp`, 'wrong-host'],
    [`https://other.public.blob.vercel-storage.com/${prefix}${FILE}.webp`, 'wrong-host'],
    [`https://${HOST}/${pendingPrefix('local', 'user-b')}${FILE}.webp`, 'wrong-prefix'],
    [`https://${HOST}/${pendingPrefix('production', 'u1')}${FILE}.webp`, 'wrong-prefix'],
    [`https://${HOST}/${prefix}${FILE}/../x.webp`, 'wrong-prefix'],
  ])('refuses %s as %s', (url, reason) => {
    expect(parsePendingUrl(url, prefix, HOST)).toEqual({ ok: false, reason });
  });
});

describe('isAllowedUploadPathname', () => {
  const prefix = pendingPrefix('local', 'u1');

  it('allows a uuid-named image directly under the prefix', () => {
    expect(isAllowedUploadPathname(`${prefix}${FILE}.png`, prefix)).toBe(true);
  });

  it.each([`${prefix}../u2/x.webp`, `${prefix}x.svg`, `${prefix}${FILE}.svg`, `codex/local/pending/u2/${FILE}.png`])(
    'refuses %s',
    (pathname) => {
      expect(isAllowedUploadPathname(pathname, prefix)).toBe(false);
    },
  );
});

describe('downloading a raw upload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const chunked = (...chunks: number[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const size of chunks) controller.enqueue(new Uint8Array(size).fill(7));
        controller.close();
      },
    });

  it('returns the bytes of an upload within the limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(chunked(3, 2))));
    expect(await defaultBlobPort.download(`https://${HOST}/x.webp`, 10)).toEqual({
      ok: true,
      bytes: new Uint8Array(5).fill(7),
    });
  });

  it('reports a missing upload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gone', { status: 404 })));
    expect(await defaultBlobPort.download(`https://${HOST}/x.webp`, 10)).toEqual({ ok: false, reason: 'missing' });
  });

  it('refuses an upload whose declared or streamed size is over the limit', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(chunked(4), { headers: { 'content-length': '11' } })));
    expect(await defaultBlobPort.download(`https://${HOST}/x.webp`, 10)).toEqual({ ok: false, reason: 'too-large' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(chunked(6, 6))));
    expect(await defaultBlobPort.download(`https://${HOST}/x.webp`, 10)).toEqual({ ok: false, reason: 'too-large' });
  });
});

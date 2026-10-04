import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const transport = vi.hoisted(() => ({ upload: vi.fn(), apiFetch: vi.fn() }));
vi.mock('@/lib/codex-blob-client', () => ({ uploadCodexBlob: transport.upload }));
vi.mock('@/transport/api-client', () => ({ apiFetch: transport.apiFetch }));

import { firstImageWithoutAlt, imageFileFrom, shrinkTarget, uploadCodexImage } from './image-upload';

test('shrinks the long edge to 2560 and keeps the aspect ratio', () => {
  expect(shrinkTarget(5120, 2880)).toEqual({ width: 2560, height: 1440 });
  expect(shrinkTarget(1920, 1080)).toEqual({ width: 1920, height: 1080 });
  expect(shrinkTarget(1000, 4000)).toEqual({ width: 640, height: 2560 });
});

test('takes the first PNG, JPEG, or WebP from a paste or drop', () => {
  const pdf = new File(['%PDF'], 'notes.pdf', { type: 'application/pdf' });
  const gif = new File(['GIF'], 'loop.gif', { type: 'image/gif' });
  const jpeg = new File(['x'], 'shot.jpg', { type: 'image/jpeg' });
  const png = new File(['x'], 'shot.png', { type: 'image/png' });

  expect(imageFileFrom({ files: [pdf, jpeg, png] as unknown as FileList })).toBe(jpeg);
  expect(imageFileFrom({ files: [pdf, gif] as unknown as FileList })).toBeNull();
  expect(imageFileFrom(null)).toBeNull();
});

test('finds the first image still missing its alt text', () => {
  expect(firstImageWithoutAlt([{ type: 'paragraph' }, { type: 'image', attrs: { assetId: 'x', alt: '' } }])).toBe(1);
  expect(firstImageWithoutAlt([{ type: 'paragraph' }, { type: 'image', attrs: { assetId: 'x', alt: 'Gila' } }])).toBeNull();
  expect(firstImageWithoutAlt([{ type: 'image', attrs: { assetId: 'x', alt: '   ' } }])).toBe(0);
});

describe('uploadCodexImage', () => {
  const ASSET = { id: 'a1', stem: 'https://s.public.blob.vercel-storage.com/codex/local/img/ab12', width: 2560, height: 1440 };
  const PREFIX = 'codex/local/pending/u1/';
  const drawn: { width: number; height: number }[] = [];
  let encodes: string[];

  beforeEach(() => {
    drawn.length = 0;
    encodes = ['image/webp'];
    transport.upload.mockReset().mockResolvedValue('https://s.public.blob.vercel-storage.com/raw.webp');
    transport.apiFetch.mockReset().mockResolvedValue({ ok: true, status: 200, data: { asset: ASSET } });
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 5120, height: 2880, close: () => {} })));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(width: number, height: number) {
          drawn.push({ width, height });
        }
        getContext() {
          return { drawImage: () => {} };
        }
        async convertToBlob({ type }: { type: string }) {
          return new Blob(['x'], { type: encodes.shift() ?? type });
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('shrinks to 2560, uploads WebP under the pilot folder, and finalizes', async () => {
    const phases: string[] = [];

    expect(await uploadCodexImage(new Blob(['png']), PREFIX, (phase) => phases.push(phase))).toEqual({ ok: true, asset: ASSET });
    expect(phases).toEqual(['shrinking', 'uploading', 'finalizing']);
    expect(drawn).toEqual([{ width: 2560, height: 1440 }]);
    expect(transport.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^codex\/local\/pending\/u1\/[0-9a-f-]{36}\.webp$/),
      expect.any(Blob),
      '/api/codex/uploads',
    );
    expect(transport.apiFetch.mock.calls[0]![1]).toEqual({ body: { url: 'https://s.public.blob.vercel-storage.com/raw.webp' } });
  });

  test('falls back to PNG when the browser cannot encode WebP', async () => {
    encodes = ['image/png', 'image/png'];
    await uploadCodexImage(new Blob(['png']), PREFIX, () => {});
    expect(transport.upload.mock.calls[0]![0]).toMatch(/\.png$/);
  });

  test('explains each refusal in a sentence', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('bad'))));
    expect(await uploadCodexImage(new Blob(['%PDF']), PREFIX, () => {})).toEqual({ ok: false, message: 'That file is not an image.' });
    vi.unstubAllGlobals();

    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 10, close: () => {} })));
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return null;
        }
        async convertToBlob() {
          return { type: 'image/webp', size: 9_000_000 };
        }
      },
    );
    expect(await uploadCodexImage(new Blob(['x']), PREFIX, () => {})).toEqual({ ok: false, message: 'Images can be at most 8 MB.' });
  });

  test('reports a failed upload or finalize', async () => {
    transport.upload.mockRejectedValueOnce(new Error('token refused'));
    expect((await uploadCodexImage(new Blob(['x']), PREFIX, () => {})).ok).toBe(false);

    transport.apiFetch.mockResolvedValueOnce({ ok: false, kind: 'api', status: 400, error: { detail: 'That file is not an image.' } });
    expect(await uploadCodexImage(new Blob(['x']), PREFIX, () => {})).toEqual({ ok: false, message: 'That file is not an image.' });

    transport.apiFetch.mockResolvedValueOnce({ ok: false, kind: 'network', aborted: false, cause: null });
    expect(await uploadCodexImage(new Blob(['x']), PREFIX, () => {})).toEqual({
      ok: false,
      message: 'The image did not upload. Try again.',
    });
  });
});

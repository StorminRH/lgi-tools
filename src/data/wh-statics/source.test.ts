import { afterEach, describe, expect, it, vi } from 'vitest';
import { WH_STATICS_FEED_URL, WH_STATICS_FETCH_TIMEOUT_MS } from './constants';
import { fetchStaticsFeed } from './source';

describe('fetchStaticsFeed', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns unchanged on 304 without reading a body', async () => {
    const text = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      status: 304,
      statusText: 'Not Modified',
      headers: new Headers(),
      text,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchStaticsFeed('"abc"')).resolves.toEqual({ status: 'unchanged' });
    expect(text).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      WH_STATICS_FEED_URL,
      expect.objectContaining({
        headers: expect.objectContaining({
          'If-None-Match': '"abc"',
          'User-Agent': expect.stringContaining('LGI.tools/'),
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('returns the changed body with ETag and Last-Modified on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"version":11}', {
        status: 200,
        headers: {
          etag: '"etag-1"',
          'last-modified': 'Sun, 05 Jan 2025 10:21:29 GMT',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchStaticsFeed(null)).resolves.toEqual({
      status: 'changed',
      body: '{"version":11}',
      etag: '"etag-1"',
      lastModified: 'Sun, 05 Jan 2025 10:21:29 GMT',
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).not.toHaveProperty('If-None-Match');
  });

  it('returns unavailable on a non-200 status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 503, statusText: 'Unavailable' })),
    );

    await expect(fetchStaticsFeed(null)).resolves.toEqual({
      status: 'unavailable',
      reason: 'anoik.is responded 503 Unavailable',
    });
  });

  it('returns unavailable when the request times out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('signal timed out', 'TimeoutError')),
    );

    await expect(fetchStaticsFeed(null)).resolves.toEqual({
      status: 'unavailable',
      reason: 'signal timed out',
    });
    expect(WH_STATICS_FETCH_TIMEOUT_MS).toBe(10_000);
  });
});

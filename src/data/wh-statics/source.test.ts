import { afterEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import {
  WH_STATICS_FEED_URL,
  WH_STATICS_FETCH_TIMEOUT_MS,
} from './constants';
import { fetchStaticsFeed } from './source';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchStaticsFeed', () => {
  it('returns unchanged on 304 without reading a response body', async () => {
    const response = new Response(null, { status: 304 });
    const textSpy = vi.spyOn(response, 'text');
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchStaticsFeed('"known"')).resolves.toEqual({
      status: 'unchanged',
    });
    expect(textSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      WH_STATICS_FEED_URL,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('If-None-Match')).toBe('"known"');
    expect(headers.get('User-Agent')).toBe(OUTBOUND_USER_AGENT);
  });

  it('returns a changed 200 response with validators and the body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"version":11}', {
          status: 200,
          headers: {
            etag: '"next"',
            'last-modified': 'Sun, 05 Jan 2025 10:21:29 GMT',
          },
        }),
      ),
    );

    await expect(fetchStaticsFeed(null)).resolves.toEqual({
      status: 'changed',
      body: '{"version":11}',
      etag: '"next"',
      lastModified: 'Sun, 05 Jan 2025 10:21:29 GMT',
    });
  });

  it('returns unavailable for a non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(null, { status: 503, statusText: 'Service Unavailable' }),
      ),
    );

    await expect(fetchStaticsFeed(null)).resolves.toEqual({
      status: 'unavailable',
      reason: 'anoik.is returned 503 Service Unavailable',
    });
  });

  it('returns unavailable when the bounded fetch times out', async () => {
    const timeout = new DOMException('signal timed out', 'TimeoutError');
    const fetchMock = vi.fn().mockRejectedValue(timeout);
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchStaticsFeed(null)).resolves.toEqual({
      status: 'unavailable',
      reason: 'signal timed out',
    });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(WH_STATICS_FETCH_TIMEOUT_MS).toBe(10_000);
  });
});

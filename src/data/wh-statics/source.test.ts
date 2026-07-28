import { afterEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import {
  WH_STATICS_FEED_URL,
  WH_STATICS_FETCH_TIMEOUT_MS,
} from './constants';
import { fetchStaticsFeed } from './source';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchStaticsFeed', () => {
  it('returns unchanged on 304 without reading a body', async () => {
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
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get('If-None-Match')).toBe('"known"');
    expect(headers.get('User-Agent')).toBe(OUTBOUND_USER_AGENT);
  });

  it('returns a changed 200 body and its validators', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"version":11}', {
          status: 200,
          headers: {
            etag: '"new"',
            'last-modified': 'Sun, 05 Jan 2025 10:21:29 GMT',
          },
        }),
      ),
    );

    await expect(fetchStaticsFeed(null)).resolves.toEqual({
      status: 'changed',
      body: '{"version":11}',
      etag: '"new"',
      lastModified: 'Sun, 05 Jan 2025 10:21:29 GMT',
    });
  });

  it('classifies non-200 responses as unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    await expect(fetchStaticsFeed(null)).resolves.toEqual({
      status: 'unavailable',
      reason: 'anoik.is returned HTTP 503',
    });
  });

  it('classifies a timeout as unavailable', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
      ),
    );

    const result = fetchStaticsFeed(null);
    await vi.advanceTimersByTimeAsync(WH_STATICS_FETCH_TIMEOUT_MS);

    await expect(result).resolves.toEqual({
      status: 'unavailable',
      reason: 'anoik.is request failed: signal timed out',
    });
  });
});

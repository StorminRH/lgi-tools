import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_USER_AGENT } from '@/config/user-agent';
import {
  WH_STATICS_FEED_URL,
  WH_STATICS_FETCH_TIMEOUT_MS,
} from './constants';

const fetchSpy = vi.fn();

vi.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => fetchSpy(...args),
  OUTBOUND_FETCH_TIMEOUT_MS: 10_000,
}));

describe('fetchStaticsFeed', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns unchanged on 304 without reading a body', async () => {
    const { fetchStaticsFeed } = await import('./source');
    const text = vi.fn();
    fetchSpy.mockResolvedValue({
      status: 304,
      statusText: 'Not Modified',
      headers: new Headers(),
      text,
    });

    await expect(fetchStaticsFeed('"abc"')).resolves.toEqual({
      status: 'unchanged',
    });
    expect(text).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      WH_STATICS_FEED_URL,
      expect.objectContaining({
        headers: expect.any(Headers),
      }),
      WH_STATICS_FETCH_TIMEOUT_MS,
    );
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('User-Agent')).toBe(OUTBOUND_USER_AGENT);
    expect(headers.get('If-None-Match')).toBe('"abc"');
  });

  it('returns the changed body with ETag and Last-Modified on 200', async () => {
    const { fetchStaticsFeed } = await import('./source');
    fetchSpy.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        etag: '"1dff6b"',
        'last-modified': 'Sun, 05 Jan 2025 10:21:29 GMT',
      }),
      text: async () => '{"version":11}',
    });

    await expect(fetchStaticsFeed(null)).resolves.toEqual({
      status: 'changed',
      body: '{"version":11}',
      etag: '"1dff6b"',
      lastModified: 'Sun, 05 Jan 2025 10:21:29 GMT',
    });
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).has('If-None-Match')).toBe(false);
  });

  it('returns unavailable on non-200 statuses', async () => {
    const { fetchStaticsFeed } = await import('./source');
    fetchSpy.mockResolvedValue({
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers(),
      text: async () => 'down',
    });

    await expect(fetchStaticsFeed(null)).resolves.toEqual({
      status: 'unavailable',
      reason: 'HTTP 503 Service Unavailable',
    });
  });

  it('returns unavailable when the fetch times out or throws', async () => {
    const { fetchStaticsFeed } = await import('./source');
    fetchSpy.mockRejectedValue(
      new DOMException('signal timed out', 'TimeoutError'),
    );

    await expect(fetchStaticsFeed('"etag"')).resolves.toEqual({
      status: 'unavailable',
      reason: 'signal timed out',
    });
  });
});

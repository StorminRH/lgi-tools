import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  fetchWithTimeout: vi.fn(),
}));

vi.mock('next/cache', () => ({
  cacheLife: h.cacheLife,
  cacheTag: h.cacheTag,
}));

vi.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: h.fetchWithTimeout,
}));

import { getEveNews } from './queries';

const FEED = `<rss><channel>
  <item><title>One</title><link>https://www.eveonline.com/news/view/one</link></item>
  <item><title>Two</title><link>https://www.eveonline.com/news/view/two</link></item>
</channel></rss>`;

describe('getEveNews', () => {
  beforeEach(() => {
    h.cacheLife.mockReset();
    h.fetchWithTimeout.mockReset();
  });

  it('returns parsed items and keeps the long-lived profile on a healthy read', async () => {
    h.fetchWithTimeout.mockResolvedValue(new Response(FEED, { status: 200 }));
    const items = await getEveNews();
    expect(items.map((i) => i.title)).toEqual(['One', 'Two']);
    expect(h.cacheLife).toHaveBeenCalledWith('hours');
  });

  // The build-safety contract: an error must NEVER cross the cache boundary —
  // under Cache Components a rejection from a 'use cache' fill during build
  // prerender fails the whole deploy even when the consumer catches it.
  it('resolves empty on a timeout instead of rethrowing across the cache boundary', async () => {
    h.fetchWithTimeout.mockRejectedValue(
      new DOMException('signal timed out', 'TimeoutError'),
    );
    await expect(getEveNews()).resolves.toEqual([]);
  });

  it('caches the failure result on the short-lived profile so it self-heals', async () => {
    h.fetchWithTimeout.mockResolvedValue(new Response('down', { status: 500 }));
    await expect(getEveNews()).resolves.toEqual([]);
    expect(h.cacheLife).toHaveBeenCalledWith(
      expect.objectContaining({ revalidate: 300 }),
    );
  });

  it('treats an unparseable body as a failure, not an error', async () => {
    h.fetchWithTimeout.mockResolvedValue(new Response('garbage', { status: 200 }));
    await expect(getEveNews()).resolves.toEqual([]);
    expect(h.cacheLife).toHaveBeenCalledWith(
      expect.objectContaining({ revalidate: 300 }),
    );
  });
});

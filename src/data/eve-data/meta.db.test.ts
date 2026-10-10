import { describe, expect, it, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import {
  SDE_CACHE_TAG,
  SDE_META_KEY_LATEST_PUBLISHED,
  SDE_META_KEY_VERSION,
  SDE_VERSION_CACHE_TAG,
} from './constants';

const cache = vi.hoisted(() => ({ cacheTag: vi.fn() }));
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: cache.cacheTag }));

const { getCachedSdeVersion, getSdeMetaValue, setSdeMetaValue } = await import('./meta');

const harness = await createDbTestHarness({
  schema: 'test_eve_data_meta',
  tables: ['eve_data_meta'],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

describe.skipIf(!harness.reachable)('SDE version read', () => {
  it('reads nothing before the first ingest or cron check, under the tag the cron refreshes', async () => {
    await expect(getCachedSdeVersion()).resolves.toEqual({
      version: null,
      ingestedAt: null,
      latestPublished: null,
    });
    expect(cache.cacheTag).toHaveBeenCalledWith(SDE_CACHE_TAG, SDE_VERSION_CACHE_TAG);
  });

  it('reads the loaded build and when it landed while CCP has published nothing newer', async () => {
    await setSdeMetaValue(harness.db, SDE_META_KEY_VERSION, '3001234');

    const read = await getCachedSdeVersion();

    expect(read).toMatchObject({ version: '3001234', latestPublished: null });
    expect(read.ingestedAt).toBeInstanceOf(Date);
  });

  it('reads a published build the cron saw before any load finished', async () => {
    await setSdeMetaValue(harness.db, SDE_META_KEY_LATEST_PUBLISHED, '3001300');

    await expect(getCachedSdeVersion()).resolves.toEqual({
      version: null,
      ingestedAt: null,
      latestPublished: '3001300',
    });
  });

  it('reads both builds in one go, and a later write replaces the published one', async () => {
    await setSdeMetaValue(harness.db, SDE_META_KEY_VERSION, '3001234');
    await setSdeMetaValue(harness.db, SDE_META_KEY_LATEST_PUBLISHED, '3001300');
    await setSdeMetaValue(harness.db, SDE_META_KEY_LATEST_PUBLISHED, '3001400');

    await expect(getCachedSdeVersion()).resolves.toMatchObject({
      version: '3001234',
      latestPublished: '3001400',
    });
    expect(await getSdeMetaValue(harness.db, SDE_META_KEY_LATEST_PUBLISHED)).toBe('3001400');
  });
});

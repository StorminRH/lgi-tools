import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  storedRow: vi.fn(),
  sdeVersion: vi.fn(),
}));

vi.mock('@/data/eve-data/meta', () => ({ getCachedSdeVersion: h.sdeVersion }));
vi.mock('next/cache', () => ({ cacheLife: h.cacheLife, cacheTag: h.cacheTag }));
vi.mock('@/lib/neon-cold-start-retry', () => ({ withColdStartRetry: (read: () => unknown) => read() }));
vi.mock('@/data/esi-store', async () => ({
  ...(await vi.importActual<typeof import('@/data/esi-store/downtime')>('@/data/esi-store/downtime')),
  ...(await vi.importActual<typeof import('@/data/esi-store/expiry')>('@/data/esi-store/expiry')),
  storedRow: h.storedRow,
}));

import { getIngestedSdeBuild, getNavServerStatus } from './queries';

const NOW = Date.parse('2026-10-12T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  h.cacheLife.mockReset();
  h.cacheTag.mockReset();
  h.storedRow.mockReset();
  h.sdeVersion.mockReset();
});

describe('getNavServerStatus', () => {
  it('serves the stored status under its tag, cached until CCP\'s expiry', async () => {
    h.storedRow.mockResolvedValue({
      expiresAt: NOW + 30_000,
      etags: [],
      lastModified: null,
      checkedAt: NOW,
      body: { status: { state: 'vip', players: 42, startedAt: null }, halt: { failures: [], haltUntil: null } },
    });

    await expect(getNavServerStatus()).resolves.toEqual({
      status: { state: 'vip', players: 42, startedAt: null },
      expiresAt: NOW + 30_000,
    });
    expect(h.cacheTag).toHaveBeenCalledWith('eve:eve_status');
    expect(h.cacheLife).toHaveBeenCalledWith({ stale: 30, revalidate: 30, expire: 30 });
    expect(h.storedRow).toHaveBeenCalledWith({ route: '/status/', holder: { kind: 'global' } });
  });

  it('reports the status unknown and due when nothing is stored or the body is malformed', async () => {
    h.storedRow.mockResolvedValueOnce(null);
    await expect(getNavServerStatus()).resolves.toEqual({ status: { state: 'unknown' }, expiresAt: null });
    expect(h.cacheLife).toHaveBeenCalledWith({ stale: 1, revalidate: 1, expire: 1 });

    h.storedRow.mockResolvedValueOnce({ expiresAt: NOW - 1, etags: [], lastModified: null, checkedAt: NOW, body: { players: 'many' } });
    await expect(getNavServerStatus()).resolves.toEqual({ status: { state: 'unknown' }, expiresAt: NOW - 1 });
  });
});

describe('getIngestedSdeBuild', () => {
  it('gives the recorded build, or none when nothing is recorded or the read fails', async () => {
    const ingestedAt = new Date('2026-10-02T16:50:42Z');
    h.sdeVersion.mockResolvedValueOnce({ version: '3569502', ingestedAt, latestPublished: '3586130' });
    await expect(getIngestedSdeBuild()).resolves.toEqual({
      build: '3569502',
      ingestedAt,
      latestPublished: '3586130',
    });

    h.sdeVersion.mockResolvedValueOnce({ version: null, ingestedAt: null, latestPublished: null });
    await expect(getIngestedSdeBuild()).resolves.toBeNull();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.sdeVersion.mockRejectedValueOnce(new Error('neon: connection terminated'));
    await expect(getIngestedSdeBuild()).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

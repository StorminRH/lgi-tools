import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  esiFetch: vi.fn(),
  sdeVersion: vi.fn(),
}));

vi.mock('@/data/eve-data/meta', () => ({ getCachedSdeVersion: h.sdeVersion }));

vi.mock('next/cache', () => ({
  cacheLife: h.cacheLife,
  cacheTag: h.cacheTag,
}));

vi.mock('@/platform/esi', () => ({
  EsiContractError: class EsiContractError extends Error {},
  EsiServerError: class EsiServerError extends Error {},
  esiFetch: h.esiFetch,
  esiUrl: (path: string) => `https://esi.example${path}`,
}));

import { EVE_STATUS_TAG } from './constants';
import { getIngestedSdeBuild, getNavServerStatus } from './queries';

beforeEach(() => {
  h.cacheLife.mockReset();
  h.cacheTag.mockReset();
  h.esiFetch.mockReset();
  h.sdeVersion.mockReset();
});

describe('getNavServerStatus', () => {
  it('returns and normally caches a healthy status', async () => {
    h.esiFetch.mockResolvedValue(
      Response.json({ players: 13_459, server_version: '3430261' }),
    );

    await expect(getNavServerStatus()).resolves.toEqual({
      state: 'online',
      players: 13_459,
      build: '3430261',
      startedAt: null,
    });
    expect(h.cacheTag).toHaveBeenCalledWith(EVE_STATUS_TAG);
    expect(h.cacheLife).toHaveBeenCalledWith({
      stale: 30,
      revalidate: 60,
      expire: 300,
    });
    expect(h.esiFetch).toHaveBeenCalledTimes(1);
    expect(h.esiFetch).toHaveBeenCalledWith('https://esi.example/status/');
    expect(h.esiFetch.mock.calls[0]).toHaveLength(1);
  });

  it.each([
    ['scoreboard refusal', () => Promise.reject(new Error('scoreboard unavailable'))],
    ['ESI error response', () => Promise.resolve(new Response(null, { status: 503 }))],
    ['malformed ESI response', () => Promise.resolve(Response.json({ players: 'many' }))],
  ])('returns a briefly cached offline state for %s', async (_label, response) => {
    h.esiFetch.mockImplementation(response);

    await expect(getNavServerStatus()).resolves.toEqual({ state: 'offline' });
    expect(h.cacheLife).toHaveBeenCalledWith({
      stale: 30,
      revalidate: 5,
      expire: 60,
    });
    expect(h.esiFetch).toHaveBeenCalledTimes(1);
    expect(h.esiFetch.mock.calls[0]).toHaveLength(1);
  });
});

describe('getIngestedSdeBuild', () => {
  it('gives the recorded build, or none when nothing is recorded or the read fails', async () => {
    const ingestedAt = new Date('2026-10-02T16:50:42Z');
    h.sdeVersion.mockResolvedValueOnce({ version: '3569502', ingestedAt });
    await expect(getIngestedSdeBuild()).resolves.toEqual({ build: '3569502', ingestedAt });

    h.sdeVersion.mockResolvedValueOnce({ version: null, ingestedAt: null });
    await expect(getIngestedSdeBuild()).resolves.toBeNull();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.sdeVersion.mockRejectedValueOnce(new Error('neon: connection terminated'));
    await expect(getIngestedSdeBuild()).resolves.toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});

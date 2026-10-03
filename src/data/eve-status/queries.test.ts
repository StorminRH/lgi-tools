import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  EsiServerError: class EsiServerError extends Error {
    constructor(readonly status: number) {
      super(`ESI server error: ${status}`);
    }
  },
  esiFetch: h.esiFetch,
  esiUrl: (path: string) => `https://esi.example${path}`,
}));

import { EsiServerError } from '@/platform/esi';
import { EVE_STATUS_TAG } from './constants';
import { getIngestedSdeBuild, getNavServerStatus } from './queries';

beforeEach(() => {
  h.cacheLife.mockReset();
  h.cacheTag.mockReset();
  h.esiFetch.mockReset();
  h.sdeVersion.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const BRIEF_CACHE = { stale: 30, revalidate: 5, expire: 60 };

/** Reads the status with the retry pauses run out. */
async function settledStatus() {
  vi.useFakeTimers();
  const status = getNavServerStatus();
  await vi.runAllTimersAsync();
  return status;
}

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
    ['a thrown 503', () => Promise.reject(new EsiServerError(503))],
    ['a 503 response', () => Promise.resolve(new Response(null, { status: 503 }))],
  ])('calls Tranquility offline at once on %s, and caches that briefly', async (_label, response) => {
    h.esiFetch.mockImplementation(response);

    await expect(getNavServerStatus()).resolves.toEqual({ state: 'offline' });
    expect(h.cacheLife).toHaveBeenCalledWith(BRIEF_CACHE);
    expect(h.esiFetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a scoreboard refusal', () => Promise.reject(new Error('scoreboard unavailable'))],
    ['a timeout', () => Promise.reject(new DOMException('signal timed out', 'TimeoutError'))],
    ['a gateway error', () => Promise.reject(new EsiServerError(502))],
    ['a client error', () => Promise.resolve(new Response(null, { status: 404 }))],
    ['a malformed body', () => Promise.resolve(Response.json({ players: 'many' }))],
  ])('retries %s and, with no answer, reports the status unknown', async (_label, response) => {
    h.esiFetch.mockImplementation(response);

    await expect(settledStatus()).resolves.toEqual({ state: 'unknown' });
    expect(h.esiFetch).toHaveBeenCalledTimes(3);
    expect(h.cacheLife).toHaveBeenCalledWith(BRIEF_CACHE);
  });

  it('keeps the status a retry recovers', async () => {
    h.esiFetch
      .mockRejectedValueOnce(new DOMException('signal timed out', 'TimeoutError'))
      .mockResolvedValueOnce(Response.json({ players: 42, vip: true }));

    await expect(settledStatus()).resolves.toMatchObject({ state: 'vip', players: 42 });
    expect(h.esiFetch).toHaveBeenCalledTimes(2);
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

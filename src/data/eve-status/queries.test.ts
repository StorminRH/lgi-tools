import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  esiFetch: vi.fn(),
}));

vi.mock('next/cache', () => ({
  cacheLife: h.cacheLife,
  cacheTag: h.cacheTag,
}));

vi.mock('@/lib/esi', () => ({
  EsiContractError: class EsiContractError extends Error {},
  EsiServerError: class EsiServerError extends Error {},
  esiFetch: h.esiFetch,
  esiUrl: (path: string) => `https://esi.example${path}`,
}));

import { EVE_STATUS_TAG } from './constants';
import { getNavServerStatus } from './queries';

beforeEach(() => {
  h.cacheLife.mockReset();
  h.cacheTag.mockReset();
  h.esiFetch.mockReset();
});

describe('getNavServerStatus', () => {
  it('returns and normally caches a healthy status', async () => {
    h.esiFetch.mockResolvedValue(
      Response.json({ players: 13_459, server_version: '3430261' }),
    );

    await expect(getNavServerStatus()).resolves.toEqual({
      state: 'online',
      players: 13_459,
    });
    expect(h.cacheTag).toHaveBeenCalledWith(EVE_STATUS_TAG);
    expect(h.cacheLife).toHaveBeenCalledWith({
      stale: 30,
      revalidate: 60,
      expire: 300,
    });
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
      expire: 300,
    });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ esiFetch: vi.fn() }));

vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock('@/platform/esi', () => ({
  esiFetch: (...args: unknown[]) => h.esiFetch(...args),
  esiUrl: (path: string) => `https://esi.test${path}`,
}));

import { resolveEntityNamesStrict } from './entity-names';

beforeEach(() => {
  h.esiFetch.mockReset();
});

describe('resolveEntityNamesStrict', () => {
  it('resolves every id while keeping cold ESI fan-out at the shared cap', async () => {
    let active = 0;
    let maxActive = 0;
    h.esiFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const [id] = JSON.parse(String(init.body)) as [number];
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return Response.json([{ category: 'character', id, name: `Pilot ${id}` }]);
    });

    const ids = Array.from({ length: 20 }, (_, index) => index + 1);
    const names = await resolveEntityNamesStrict(ids);

    expect(maxActive).toBe(8);
    expect(h.esiFetch).toHaveBeenCalledTimes(20);
    expect(names).toEqual(
      Object.fromEntries(ids.map((id) => [String(id), `Pilot ${id}`])),
    );
  });

  it('fails the whole result when any authoritative live id cannot be named', async () => {
    h.esiFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const [id] = JSON.parse(String(init.body)) as [number];
      return id === 2
        ? new Response(null, { status: 503 })
        : Response.json([{ category: 'character', id, name: `Pilot ${id}` }]);
    });

    await expect(resolveEntityNamesStrict([1, 2, 3])).rejects.toThrow(
      'EVE entity name request failed (503)',
    );
  });

  it('can recover after a transient upstream failure instead of returning a cacheable null', async () => {
    h.esiFetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        Response.json([{ category: 'character', id: 7, name: 'Recovered Pilot' }]),
      );

    await expect(resolveEntityNamesStrict([7])).rejects.toThrow(
      'EVE entity name request failed (503)',
    );
    await expect(resolveEntityNamesStrict([7])).resolves.toEqual({
      '7': 'Recovered Pilot',
    });
    expect(h.esiFetch).toHaveBeenCalledTimes(2);
  });
});

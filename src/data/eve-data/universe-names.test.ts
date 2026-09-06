import { beforeEach, describe, expect, it, vi } from 'vitest';

const esiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/platform/esi', () => ({
  esiFetch: (...args: unknown[]) => esiFetchMock(...args),
  esiUrl: (path: string) => `https://esi.example${path}`,
}));

import { postUniverseNames } from './universe-names';

beforeEach(() => {
  esiFetchMock.mockReset();
});

describe('postUniverseNames', () => {
  it('keeps named rows and drops malformed entries', async () => {
    esiFetchMock.mockResolvedValue(
      Response.json([
        { category: 'station', id: 60_000_001, name: 'First Station' },
        { category: 'character', id: 7, name: 'Pilot' },
        { id: 9, name: 'No category' },
        { category: 'station', id: 'bad', name: 'Nope' },
        { category: 'station', id: 1 },
        null,
        'skip',
      ]),
    );
    await expect(postUniverseNames([60_000_001, 7, 9])).resolves.toEqual({
      ok: true,
      data: [
        { category: 'station', id: 60_000_001, name: 'First Station' },
        { category: 'character', id: 7, name: 'Pilot' },
        { category: null, id: 9, name: 'No category' },
      ],
    });
  });

  it.each([{ names: [] }, null, 'unexpected', 7])(
    'rejects a malformed envelope: %j',
    async (body) => {
      esiFetchMock.mockResolvedValue(Response.json(body));

      await expect(postUniverseNames([7])).rejects.toThrow(
        'ESI /universe/names/ response was malformed',
      );
    },
  );

  it('preserves a valid empty response', async () => {
    esiFetchMock.mockResolvedValue(Response.json([]));

    await expect(postUniverseNames([7])).resolves.toEqual({ ok: true, data: [] });
  });

  it('posts the id list and returns the JSON body', async () => {
    esiFetchMock.mockResolvedValue(
      Response.json([{ category: 'station', id: 60_000_001, name: 'First Station' }]),
    );

    await expect(postUniverseNames([60_000_001])).resolves.toEqual({
      ok: true,
      data: [{ category: 'station', id: 60_000_001, name: 'First Station' }],
    });
    expect(esiFetchMock).toHaveBeenCalledWith(
      'https://esi.example/universe/names/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify([60_000_001]),
      }),
    );
  });

  it('returns the status when ESI rejects the post', async () => {
    esiFetchMock.mockResolvedValue(new Response(null, { status: 503 }));

    await expect(postUniverseNames([7])).resolves.toEqual({ ok: false, status: 503 });
  });
});

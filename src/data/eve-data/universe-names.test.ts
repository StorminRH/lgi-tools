import { beforeEach, describe, expect, it, vi } from 'vitest';

const esiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/platform/esi', () => ({
  esiFetch: (...args: unknown[]) => esiFetchMock(...args),
  esiUrl: (path: string) => `https://esi.example${path}`,
}));

import {
  parseUniverseNameRows,
  postUniverseNames,
  type UniverseNameRow,
} from './universe-names';

beforeEach(() => {
  esiFetchMock.mockReset();
});

describe('parseUniverseNameRows', () => {
  it('keeps named rows and drops malformed entries', () => {
    const rows: UniverseNameRow[] = parseUniverseNameRows([
      { category: 'station', id: 60_000_001, name: 'First Station' },
      { category: 'character', id: 7, name: 'Pilot' },
      { id: 9, name: 'No category' },
      { category: 'station', id: 'bad', name: 'Nope' },
      { category: 'station', id: 1 },
      null,
      'skip',
    ]);
    expect(rows).toEqual([
      { category: 'station', id: 60_000_001, name: 'First Station' },
      { category: 'character', id: 7, name: 'Pilot' },
      { category: null, id: 9, name: 'No category' },
    ]);
  });

  it('returns nothing when the payload is not an array', () => {
    expect(parseUniverseNameRows({ names: [] })).toEqual([]);
  });
});

describe('postUniverseNames', () => {
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

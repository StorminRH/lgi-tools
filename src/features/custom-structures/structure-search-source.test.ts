import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/transport/api-client', () => ({
  apiFetch: (...args: unknown[]) => h.apiFetch(...args),
}));

import { structureSearchHit, structuresSearchSource } from './structure-search-source';

const ctx = { session: null, isAdmin: false, recents: [] };
const HIT = { structureId: 1_035_000_000_001, name: 'Sobaseki - Industry Azbel', systemId: 30001363, structureTypeId: 35826 };

beforeEach(() => {
  h.apiFetch.mockReset().mockResolvedValue({ ok: true, status: 200, data: { results: [HIT] } });
});

describe('structuresSearchSource', () => {
  it('stays out of the header search', () => {
    expect(structuresSearchSource.excludeFromDefaultScope).toBe(true);
  });

  it('does not call ESI below three characters', async () => {
    expect(await structuresSearchSource.search(' So ', ctx)).toEqual([]);
    expect(h.apiFetch).not.toHaveBeenCalled();
  });

  it('returns structure results and remembers the full hit behind each id', async () => {
    const [result] = await structuresSearchSource.search(' Sobaseki ', ctx);
    expect(result).toMatchObject({ kind: 'structure', label: 'Sobaseki - Industry Azbel', typeId: 35826 });
    expect(structureSearchHit(result!.id)).toEqual(HIT);
    expect(h.apiFetch.mock.calls[0]![1]).toMatchObject({ body: { search: 'Sobaseki' } });
  });

  it('returns nothing when the search route fails', async () => {
    h.apiFetch.mockResolvedValue({ ok: false, status: 503 });
    expect(await structuresSearchSource.search('Sobaseki', ctx)).toEqual([]);
  });
});

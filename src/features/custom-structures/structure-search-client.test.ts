import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/transport/api-client', () => ({ apiFetch: mocks.apiFetch }));

import { searchStructuresEndpoint } from './api-contract';
import { searchStructures } from './structure-search-client';

const hit = { structureId: 1, name: 'Jita - Fort', structureTypeId: 35826, systemId: 30000142 };

describe('searchStructures', () => {
  it('posts the search to the typed endpoint and returns its results', async () => {
    const { signal } = new AbortController();
    mocks.apiFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { results: [hit] } });

    await expect(searchStructures('Jita', signal)).resolves.toEqual([hit]);
    expect(mocks.apiFetch).toHaveBeenCalledWith(searchStructuresEndpoint, {
      body: { search: 'Jita' },
      cache: 'no-store',
      signal,
    });
  });

  it('returns no structures when the request fails', async () => {
    mocks.apiFetch.mockResolvedValueOnce({ ok: false, kind: 'network', status: 0 });

    await expect(searchStructures('Jita', new AbortController().signal)).resolves.toEqual([]);
  });
});

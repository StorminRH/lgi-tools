import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/transport/api-client', () => ({ apiFetch: mocks.apiFetch }));

import { searchStructuresEndpoint } from './api-contract';
import { searchStructures } from './structure-search-client';

const hit = { structureId: 1, name: 'Jita - Fort', structureTypeId: 35826, systemId: 30000142 };

test('posts the search to the structures endpoint and returns nothing when that request fails', async () => {
  const { signal } = new AbortController();
  mocks.apiFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { results: [hit] } });
  await expect(searchStructures('Jita', signal)).resolves.toEqual([hit]);
  expect(mocks.apiFetch).toHaveBeenCalledWith(searchStructuresEndpoint, {
    body: { search: 'Jita' },
    cache: 'no-store',
    signal,
  });

  mocks.apiFetch.mockResolvedValueOnce({ ok: false, kind: 'network', status: 0 });
  await expect(searchStructures('Jita', new AbortController().signal)).resolves.toEqual([]);
});

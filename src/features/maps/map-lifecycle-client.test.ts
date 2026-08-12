import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/transport/api-client', () => ({ apiFetch: mocks.apiFetch }));

import {
  deleteMapEndpoint,
  purgeMapNowEndpoint,
  restoreMapEndpoint,
} from '@/data/maps/api-contract';
import {
  deleteMap,
  requestMapPurge,
  restoreMap,
} from './map-lifecycle-client';

describe('map lifecycle client', () => {
  it.each([
    [deleteMap, deleteMapEndpoint],
    [restoreMap, restoreMapEndpoint],
    [requestMapPurge, purgeMapNowEndpoint],
  ] as const)('executes each lifecycle mutation through its typed endpoint', async (execute, endpoint) => {
    mocks.apiFetch.mockResolvedValueOnce({ ok: true, status: 204, data: undefined });
    await expect(execute({ mapId: 'map-a' })).resolves.toMatchObject({ ok: true });
    expect(mocks.apiFetch).toHaveBeenLastCalledWith(endpoint, {
      body: { mapId: 'map-a' },
      cache: 'no-store',
    });
  });
});

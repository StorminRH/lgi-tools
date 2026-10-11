import { describe, expect, it, vi } from 'vitest';
import { apiProblem, networkDown } from '@/transport/__tests__/failed-outcomes';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('@/transport/api-client', () => ({ apiFetch: mocks.apiFetch }));

import {
  deleteMapEndpoint,
  purgeMapNowEndpoint,
  restoreMapEndpoint,
} from '@/data/maps/api-contract';
import {
  deleteMap,
  mapLifecycleFailureMessage,
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

  it('names a refusal by its code and blames map access only when the server did', () => {
    expect(mapLifecycleFailureMessage('delete', apiProblem(403, 'map_admin_required'))).toBe(
      'This map could not be deleted. Map admin access is required.',
    );
    expect(mapLifecycleFailureMessage('restore', apiProblem(403, 'map_restore_unavailable'))).toBe(
      'This map could not be restored. Its undo window may have ended.',
    );
    expect(mapLifecycleFailureMessage('purge', apiProblem(403, 'map_creator_required'))).toBe(
      'Only the map creator can permanently delete the selected maps.',
    );

    // No answer, an ended session or a malformed request is not a permission problem.
    expect(mapLifecycleFailureMessage('delete', networkDown())).toBe(
      'This map could not be deleted. Check your connection and try again.',
    );
    expect(mapLifecycleFailureMessage('purge', apiProblem(401, 'unauthenticated'))).toBe(
      'Your session has ended. Sign in again.',
    );
    expect(mapLifecycleFailureMessage('restore', apiProblem(400, 'invalid_body'))).toBe(
      'This map could not be restored.',
    );
    expect(mapLifecycleFailureMessage('purge', apiProblem(403, 'cross_origin'))).toBe(
      'The selected maps could not be permanently deleted.',
    );
  });
});

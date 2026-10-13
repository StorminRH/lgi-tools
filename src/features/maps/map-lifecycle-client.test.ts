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

  it('gives every refusal the action\'s retry copy, naming only an ended session', () => {
    // The route folds every refusal into one 403 code, so none of them names a cause.
    expect(mapLifecycleFailureMessage('delete', apiProblem(403, 'map_admin_required'))).toBe(
      "This map couldn't be deleted. Try again.",
    );
    expect(mapLifecycleFailureMessage('restore', apiProblem(403, 'map_restore_unavailable'))).toBe(
      "The selected maps couldn't be restored. Try again.",
    );
    expect(mapLifecycleFailureMessage('purge', apiProblem(403, 'map_creator_required'))).toBe(
      "The selected maps couldn't be permanently deleted. Try again.",
    );

    // No answer, an ended session or a malformed request is not a permission problem.
    expect(mapLifecycleFailureMessage('delete', networkDown())).toBe(
      "This map couldn't be deleted. Try again.",
    );
    expect(mapLifecycleFailureMessage('purge', apiProblem(401, 'unauthenticated'))).toBe(
      'Your session has ended. Sign in again.',
    );
    expect(mapLifecycleFailureMessage('restore', apiProblem(400, 'invalid_body'))).toBe(
      "The selected maps couldn't be restored. Try again.",
    );
    expect(mapLifecycleFailureMessage('purge', apiProblem(403, 'cross_origin'))).toBe(
      "The selected maps couldn't be permanently deleted. Try again.",
    );
  });
});

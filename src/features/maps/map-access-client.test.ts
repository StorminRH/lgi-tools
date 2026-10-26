import { expect, test, vi } from 'vitest';
import { apiProblem, networkDown, protocolFailure } from '@/transport/__tests__/failed-outcomes';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/transport/api-client', () => ({ apiFetch: mocks.apiFetch }));

import { updateMapAccessEndpoint } from '@/data/maps/api-contract';
import { mapAccessFailureMessage, updateMapAccess } from './map-access-client';

test('map access uses the typed endpoint, and its failures read the refusal code, the connection hint, or the plain fallback', async () => {
  const input = {
    operation: 'upsert' as const,
    mapId: 'map-a',
    grant: { ownerType: 'character' as const, ownerId: 42, role: 'editor' as const },
  };
  mocks.apiFetch.mockResolvedValueOnce({ ok: true, status: 204, data: undefined });

  await expect(updateMapAccess(input)).resolves.toMatchObject({ ok: true });
  expect(mocks.apiFetch).toHaveBeenCalledWith(updateMapAccessEndpoint, {
    body: input,
    cache: 'no-store',
  });

  // Projection lag is retry-safe: the grant is saved.
  expect(mapAccessFailureMessage(apiProblem(503, 'map_projection_unavailable'))).toBe(
    "Saved, but live access hasn't updated yet. Try the change again.",
  );
  expect(mapAccessFailureMessage(apiProblem(403, 'map_admin_required'))).toBe('Only map admins can change access.');
  expect(mapAccessFailureMessage(networkDown())).toBe(
    "Couldn't update map access. Check your connection and try again.",
  );
  // A malformed request, the cross-origin guard and an undeclared answer blame neither admin access nor the connection.
  expect(mapAccessFailureMessage(apiProblem(400, 'invalid_body'))).toBe("Couldn't update map access. Try again.");
  expect(mapAccessFailureMessage(apiProblem(403, 'cross_origin'))).toBe("Couldn't update map access. Try again.");
  expect(mapAccessFailureMessage(protocolFailure())).toBe("Couldn't update map access. Try again.");
});

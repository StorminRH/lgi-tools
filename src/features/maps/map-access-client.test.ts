import { describe, expect, it, vi } from 'vitest';
import { apiProblem, networkDown, protocolFailure } from '@/transport/__tests__/failed-outcomes';

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock('@/transport/api-client', () => ({ apiFetch: mocks.apiFetch }));

import { updateMapAccessEndpoint } from '@/data/maps/api-contract';
import { mapAccessFailureMessage, updateMapAccess } from './map-access-client';

describe('map access client', () => {
  it('uses the typed access endpoint and gives projection lag its retry-safe message', async () => {
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

    expect(mapAccessFailureMessage(apiProblem(503, 'map_projection_unavailable'))).toBe(
      "Saved, but live access hasn't updated yet. Try the change again.",
    );
  });

  it('names each refusal by its code', () => {
    expect(mapAccessFailureMessage(apiProblem(409, 'map_block_owner'))).toBe("You can't block the map creator.");
    expect(mapAccessFailureMessage(apiProblem(409, 'map_block_self'))).toBe("You can't block your own character.");
    expect(mapAccessFailureMessage(apiProblem(409, 'map_creator_character_required'))).toBe(
      'The map creator needs at least one of their characters on the access list.',
    );
    expect(mapAccessFailureMessage(apiProblem(403, 'map_admin_required'))).toBe('Only map admins can change access.');
  });

  it('keeps the connection hint for a request that got no answer and blames neither admin access nor the connection otherwise', () => {
    expect(mapAccessFailureMessage(networkDown())).toBe(
      "Couldn't update map access. Check your connection and try again.",
    );
    expect(mapAccessFailureMessage(apiProblem(401, 'unauthenticated'))).toBe('Your session has ended. Sign in again.');
    // A malformed request, the cross-origin guard and an undeclared answer all get the plain fallback.
    expect(mapAccessFailureMessage(apiProblem(400, 'invalid_body'))).toBe("Couldn't update map access. Try again.");
    expect(mapAccessFailureMessage(apiProblem(403, 'cross_origin'))).toBe("Couldn't update map access. Try again.");
    expect(mapAccessFailureMessage(protocolFailure())).toBe("Couldn't update map access. Try again.");
  });
});

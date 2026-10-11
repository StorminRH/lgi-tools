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

    expect(mapAccessFailureMessage(apiProblem(503, 'map_projection_unavailable'))).toContain(
      'Retry the same change',
    );
  });

  it('names each refusal by its code', () => {
    expect(mapAccessFailureMessage(apiProblem(409, 'map_block_owner'))).toBe('This character belongs to the map owner.');
    expect(mapAccessFailureMessage(apiProblem(409, 'map_block_self'))).toBe("You can't block your own character.");
    expect(mapAccessFailureMessage(apiProblem(409, 'map_creator_character_required'))).toContain(
      'at least one of their own characters',
    );
    expect(mapAccessFailureMessage(apiProblem(403, 'map_admin_required'))).toBe(
      'Map admin access is required to change this access list.',
    );
  });

  it('keeps the connection hint for a request that got no answer and blames neither admin access nor the connection otherwise', () => {
    expect(mapAccessFailureMessage(networkDown())).toBe(
      'Map access could not be updated. Check your connection and try again.',
    );
    expect(mapAccessFailureMessage(apiProblem(401, 'unauthenticated'))).toBe('Your session has ended. Sign in again.');
    // A malformed request, the cross-origin guard and an undeclared answer all get the plain fallback.
    expect(mapAccessFailureMessage(apiProblem(400, 'invalid_body'))).toBe('Map access could not be updated.');
    expect(mapAccessFailureMessage(apiProblem(403, 'cross_origin'))).toBe('Map access could not be updated.');
    expect(mapAccessFailureMessage(protocolFailure())).toBe('Map access could not be updated.');
  });
});

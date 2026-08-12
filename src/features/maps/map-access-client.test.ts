import { describe, expect, it, vi } from 'vitest';

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

    expect(
      mapAccessFailureMessage({
        ok: false,
        kind: 'api',
        status: 503,
        error: {
          type: 'about:blank',
          title: 'Unavailable',
          status: 503,
          code: 'map_projection_unavailable',
          correlationId: 'test-correlation',
        },
      }),
    ).toContain('Retry the same change');
  });
});

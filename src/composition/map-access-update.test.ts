import { describe, expect, it, vi } from 'vitest';
import { ProjectionUnavailableError } from './map-access-projection';
import { applyMapAccessUpdate } from './map-access-update';

const UPSERT = {
  operation: 'upsert' as const,
  mapId: 'map-1',
  grant: {
    ownerType: 'character' as const,
    ownerId: 42,
    role: 'editor' as const,
  },
};

describe('applyMapAccessUpdate', () => {
  it('resolves principals, atomically authorizes and writes Neon, then re-projects', async () => {
    const order: string[] = [];
    const resolvePrincipals = vi.fn().mockResolvedValue({
      characterIds: [7],
      corporationIds: [8],
    });
    const applyGrantChange = vi.fn(async () => {
      order.push('neon');
      return true;
    });
    const projectAccess = vi.fn(async () => {
      order.push('projection');
      return { inserted: 0, updated: 1, deleted: 0, unchanged: 0 };
    });

    await expect(
      applyMapAccessUpdate('user-1', UPSERT, {
        resolvePrincipals,
        applyGrantChange,
        projectAccess,
      }),
    ).resolves.toEqual({ ok: true });
    expect(resolvePrincipals).toHaveBeenCalledWith('user-1');
    expect(applyGrantChange).toHaveBeenCalledWith(
      'user-1',
      { characterIds: [7], corporationIds: [8] },
      'map-1',
      { operation: 'upsert', grant: UPSERT.grant },
    );
    expect(projectAccess).toHaveBeenCalledWith('map-1');
    expect(order).toEqual(['neon', 'projection']);
  });

  it('refuses when the atomic active-map write finds no admin authority', async () => {
    const applyGrantChange = vi.fn().mockResolvedValue(false);
    const projectAccess = vi.fn();

    await expect(
      applyMapAccessUpdate('user-1', UPSERT, {
        resolvePrincipals: vi.fn().mockResolvedValue({
          characterIds: [7],
          corporationIds: [],
        }),
        applyGrantChange,
        projectAccess,
      }),
    ).resolves.toEqual({ ok: false, reason: 'forbidden' });
    expect(applyGrantChange).toHaveBeenCalledOnce();
    expect(projectAccess).not.toHaveBeenCalled();
  });

  it('revokes the exact principal and still runs the full projection', async () => {
    const applyGrantChange = vi.fn().mockResolvedValue(true);
    const projectAccess = vi.fn().mockResolvedValue({
      inserted: 0,
      updated: 0,
      deleted: 1,
      unchanged: 0,
    });
    const revoke = {
      operation: 'revoke' as const,
      mapId: 'map-1',
      principal: { ownerType: 'corporation' as const, ownerId: 99 },
    };

    await expect(
      applyMapAccessUpdate('admin', revoke, {
        resolvePrincipals: vi.fn().mockResolvedValue({
          characterIds: [],
          corporationIds: [99],
        }),
        applyGrantChange,
        projectAccess,
      }),
    ).resolves.toEqual({ ok: true });
    expect(applyGrantChange).toHaveBeenCalledWith(
      'admin',
      { characterIds: [], corporationIds: [99] },
      'map-1',
      { operation: 'revoke', principal: revoke.principal },
    );
    expect(projectAccess).toHaveBeenCalledWith('map-1');
  });

  it('surfaces typed projection unavailability after the durable write', async () => {
    const unavailable = new ProjectionUnavailableError('offline');
    const applyGrantChange = vi.fn().mockResolvedValue(true);

    await expect(
      applyMapAccessUpdate('admin', UPSERT, {
        resolvePrincipals: vi.fn().mockResolvedValue({
          characterIds: [],
          corporationIds: [],
        }),
        applyGrantChange,
        projectAccess: vi.fn().mockRejectedValue(unavailable),
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'projection-unavailable',
      cause: unavailable,
    });
    expect(applyGrantChange).toHaveBeenCalledOnce();
  });

  it('does not relabel unexpected durable or projection failures', async () => {
    const failure = new Error('database failed');
    await expect(
      applyMapAccessUpdate('admin', UPSERT, {
        resolvePrincipals: vi.fn().mockResolvedValue({
          characterIds: [],
          corporationIds: [],
        }),
        applyGrantChange: vi.fn().mockRejectedValue(failure),
        projectAccess: vi.fn(),
      }),
    ).rejects.toBe(failure);
  });
});

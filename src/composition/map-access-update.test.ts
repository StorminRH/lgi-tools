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
  it('retains the captured generation when a newer projection wins', async () => {
    const acknowledgeAccess = vi.fn();
    const result = await applyMapAccessUpdate('admin', UPSERT, {
      resolvePrincipals: vi.fn().mockResolvedValue({ characterIds: [], corporationIds: [] }),
      applyGrantChange: vi.fn().mockResolvedValue({ mapId: 'map-1', version: 'captured' }),
      projectAccess: vi.fn().mockResolvedValue({ outcome: 'stale' }),
      acknowledgeAccess,
    });
    expect(result).toMatchObject({ ok: false, reason: 'projection-unavailable' });
    expect(acknowledgeAccess).not.toHaveBeenCalled();
  });

  it('authorizes Neon then projects upsert and revoke, and refuses without admin authority', async () => {
    const order: string[] = [];
    const resolvePrincipals = vi.fn().mockResolvedValue({
      characterIds: [7],
      corporationIds: [8],
    });
    const applyGrantChange = vi.fn(async () => {
      order.push('neon');
      return { mapId: 'map-1', version: 'captured' };
    });
    const acknowledgeAccess = vi.fn(async () => {
      order.push('acknowledge');
    });
    const projectAccess = vi.fn(async () => {
      order.push('projection');
      return {
        inserted: 0,
        updated: 1,
        deleted: 0,
        unchanged: 0,
        outcome: 'applied' as const,
      };
    });

    await expect(
      applyMapAccessUpdate('user-1', UPSERT, {
        resolvePrincipals,
        applyGrantChange,
        acknowledgeAccess,
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
    expect(acknowledgeAccess).toHaveBeenCalledWith([{ mapId: 'map-1', version: 'captured' }]);
    expect(order).toEqual(['neon', 'projection', 'acknowledge']);

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
        applyGrantChange: vi.fn().mockResolvedValue({ mapId: 'map-1', version: 'captured' }),
        acknowledgeAccess: vi.fn().mockResolvedValue(undefined),
        projectAccess: vi.fn().mockResolvedValue({
          inserted: 0,
          updated: 0,
          deleted: 1,
          unchanged: 0,
          outcome: 'applied',
        }),
      }),
    ).resolves.toEqual({ ok: true });

    const refusedProject = vi.fn();
    const refusedAcknowledge = vi.fn();
    await expect(
      applyMapAccessUpdate('user-1', UPSERT, {
        resolvePrincipals: vi.fn().mockResolvedValue({
          characterIds: [7],
          corporationIds: [],
        }),
        applyGrantChange: vi.fn().mockResolvedValue(null),
        acknowledgeAccess: refusedAcknowledge,
        projectAccess: refusedProject,
      }),
    ).resolves.toEqual({ ok: false, reason: 'forbidden' });
    expect(refusedProject).not.toHaveBeenCalled();
    expect(refusedAcknowledge).not.toHaveBeenCalled();
  });

  it('surfaces typed projection unavailability after the durable write and rethrows unexpected failures', async () => {
    const unavailable = new ProjectionUnavailableError('offline');
    const applyGrantChange = vi.fn().mockResolvedValue({ mapId: 'map-1', version: 'captured' });
    const acknowledgeAccess = vi.fn();

    await expect(
      applyMapAccessUpdate('admin', UPSERT, {
        resolvePrincipals: vi.fn().mockResolvedValue({
          characterIds: [],
          corporationIds: [],
        }),
        applyGrantChange,
        acknowledgeAccess,
        projectAccess: vi.fn().mockRejectedValue(unavailable),
      }),
    ).resolves.toEqual({
      ok: false,
      reason: 'projection-unavailable',
      cause: unavailable,
    });
    expect(applyGrantChange).toHaveBeenCalledOnce();
    expect(acknowledgeAccess).not.toHaveBeenCalled();

    const failure = new Error('database failed');
    await expect(
      applyMapAccessUpdate('admin', UPSERT, {
        resolvePrincipals: vi.fn().mockResolvedValue({
          characterIds: [],
          corporationIds: [],
        }),
        applyGrantChange: vi.fn().mockRejectedValue(failure),
        acknowledgeAccess: vi.fn(),
        projectAccess: vi.fn(),
      }),
    ).rejects.toBe(failure);
  });
});

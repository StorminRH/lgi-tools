import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectionUnavailableError } from './map-access-projection';
import {
  deleteMapForUser,
  requestMapPurgeForUser,
  restoreMapForUser,
} from './map-lifecycle';

const INPUT = { mapId: 'map-1' };
const PRINCIPALS = { characterIds: [42], corporationIds: [99] };

afterEach(() => {
  vi.restoreAllMocks();
});

const PENDING = { mapId: 'map-1', version: 'captured' };

describe('map lifecycle composition', () => {
  it('archives then projects delete/restore, refuses unauthorized work, and keeps the captured generation when projection is pending', async () => {
    const order: string[] = [];
    const archiveMap = vi.fn(async () => {
      order.push('neon');
      return PENDING;
    });
    const projectAccess = vi.fn(async () => {
      order.push('projection');
      return {
        inserted: 0,
        updated: 0,
        deleted: 1,
        unchanged: 0,
        outcome: 'applied' as const,
      };
    });
    const acknowledgeAccess = vi.fn(async () => {
      order.push('acknowledge');
    });

    await expect(
      deleteMapForUser('user', INPUT, {
        resolvePrincipals: vi.fn().mockResolvedValue(PRINCIPALS),
        archiveMap,
        projectAccess,
        acknowledgeAccess,
      }),
    ).resolves.toEqual({ ok: true, projectionPending: false });
    expect(archiveMap).toHaveBeenCalledWith('user', PRINCIPALS, 'map-1');
    expect(acknowledgeAccess).toHaveBeenCalledWith([PENDING]);
    expect(order).toEqual(['neon', 'projection', 'acknowledge']);

    const restoreOrder: string[] = [];
    await expect(
      restoreMapForUser('user', INPUT, {
        resolvePrincipals: vi.fn().mockResolvedValue(PRINCIPALS),
        restoreMap: vi.fn(async () => {
          restoreOrder.push('neon');
          return PENDING;
        }),
        projectAccess: vi.fn(async () => {
          restoreOrder.push('projection');
          return {
            inserted: 1,
            updated: 0,
            deleted: 0,
            unchanged: 0,
            outcome: 'applied' as const,
          };
        }),
        acknowledgeAccess: vi.fn(async () => {
          restoreOrder.push('acknowledge');
        }),
      }),
    ).resolves.toEqual({ ok: true, projectionPending: false });
    expect(restoreOrder).toEqual(['neon', 'projection', 'acknowledge']);

    const refusedArchiveProject = vi.fn();
    const refusedProject = vi.fn();
    const refusedAcknowledge = vi.fn();
    const common = { resolvePrincipals: vi.fn().mockResolvedValue(PRINCIPALS) };
    await expect(
      deleteMapForUser('user', INPUT, {
        ...common,
        archiveMap: vi.fn().mockResolvedValue(null),
        projectAccess: refusedArchiveProject,
        acknowledgeAccess: refusedAcknowledge,
      }),
    ).resolves.toEqual({ ok: false });
    await expect(
      restoreMapForUser('user', INPUT, {
        ...common,
        restoreMap: vi.fn().mockResolvedValue(null),
        projectAccess: refusedProject,
        acknowledgeAccess: refusedAcknowledge,
      }),
    ).resolves.toEqual({ ok: false });
    expect(refusedArchiveProject).not.toHaveBeenCalled();
    expect(refusedProject).not.toHaveBeenCalled();
    expect(refusedAcknowledge).not.toHaveBeenCalled();

    vi.spyOn(console, 'error').mockImplementation(() => {});
    const unavailable = new ProjectionUnavailableError('offline');
    const pendingAcknowledge = vi.fn();
    await expect(
      deleteMapForUser('user', INPUT, {
        ...common,
        archiveMap: vi.fn().mockResolvedValue(PENDING),
        projectAccess: vi.fn().mockRejectedValue(unavailable),
        acknowledgeAccess: pendingAcknowledge,
      }),
    ).resolves.toEqual({ ok: true, projectionPending: true });
    await expect(
      restoreMapForUser('user', INPUT, {
        ...common,
        restoreMap: vi.fn().mockResolvedValue(PENDING),
        projectAccess: vi.fn().mockRejectedValue(unavailable),
        acknowledgeAccess: pendingAcknowledge,
      }),
    ).resolves.toEqual({ ok: true, projectionPending: true });
    expect(pendingAcknowledge).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it('marks projection pending when archive or restore is stale', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const stale = {
      inserted: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      outcome: 'stale' as const,
    };
    const acknowledgeAccess = vi.fn();
    await expect(
      deleteMapForUser('user', INPUT, {
        resolvePrincipals: vi.fn().mockResolvedValue(PRINCIPALS),
        archiveMap: vi.fn().mockResolvedValue(PENDING),
        projectAccess: vi.fn().mockResolvedValue(stale),
        acknowledgeAccess,
      }),
    ).resolves.toEqual({ ok: true, projectionPending: true });
    await expect(
      restoreMapForUser('user', INPUT, {
        resolvePrincipals: vi.fn().mockResolvedValue(PRINCIPALS),
        restoreMap: vi.fn().mockResolvedValue(PENDING),
        projectAccess: vi.fn().mockResolvedValue(stale),
        acknowledgeAccess,
      }),
    ).resolves.toEqual({ ok: true, projectionPending: true });
    expect(acknowledgeAccess).not.toHaveBeenCalled();
  });

  it('rethrows unexpected projection failures', async () => {
    const failure = new Error('bug');
    const acknowledgeAccess = vi.fn();
    await expect(
      restoreMapForUser('user', INPUT, {
        resolvePrincipals: vi.fn().mockResolvedValue(PRINCIPALS),
        restoreMap: vi.fn().mockResolvedValue(PENDING),
        projectAccess: vi.fn().mockRejectedValue(failure),
        acknowledgeAccess,
      }),
    ).rejects.toBe(failure);
    expect(acknowledgeAccess).not.toHaveBeenCalled();
  });

  it('requests purge without any projection or hard-delete effect', async () => {
    const requestPurge = vi.fn().mockResolvedValue(true);
    await expect(
      requestMapPurgeForUser('creator', INPUT, { requestPurge }),
    ).resolves.toEqual({ ok: true });
    expect(requestPurge).toHaveBeenCalledWith('creator', 'map-1');
  });
});

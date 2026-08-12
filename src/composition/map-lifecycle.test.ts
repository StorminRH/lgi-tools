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

describe('map lifecycle composition', () => {
  it('archives durably before tearing down the projection', async () => {
    const order: string[] = [];
    const archiveMap = vi.fn(async () => {
      order.push('neon');
      return true;
    });
    const teardownAccess = vi.fn(async () => {
      order.push('projection');
      return { inserted: 0, updated: 0, deleted: 1, unchanged: 0 };
    });

    await expect(
      deleteMapForUser('user', INPUT, {
        resolvePrincipals: vi.fn().mockResolvedValue(PRINCIPALS),
        archiveMap,
        teardownAccess,
      }),
    ).resolves.toEqual({ ok: true, projectionPending: false });
    expect(archiveMap).toHaveBeenCalledWith('user', PRINCIPALS, 'map-1');
    expect(order).toEqual(['neon', 'projection']);
  });

  it('never projects a refused delete or restore', async () => {
    const teardownAccess = vi.fn();
    const projectAccess = vi.fn();
    const common = { resolvePrincipals: vi.fn().mockResolvedValue(PRINCIPALS) };

    await expect(
      deleteMapForUser('user', INPUT, {
        ...common,
        archiveMap: vi.fn().mockResolvedValue(false),
        teardownAccess,
      }),
    ).resolves.toEqual({ ok: false });
    await expect(
      restoreMapForUser('user', INPUT, {
        ...common,
        restoreMap: vi.fn().mockResolvedValue(false),
        projectAccess,
      }),
    ).resolves.toEqual({ ok: false });
    expect(teardownAccess).not.toHaveBeenCalled();
    expect(projectAccess).not.toHaveBeenCalled();
  });

  it('keeps durable delete and restore successful when typed projection delivery is pending', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const unavailable = new ProjectionUnavailableError('offline');
    const common = { resolvePrincipals: vi.fn().mockResolvedValue(PRINCIPALS) };

    await expect(
      deleteMapForUser('user', INPUT, {
        ...common,
        archiveMap: vi.fn().mockResolvedValue(true),
        teardownAccess: vi.fn().mockRejectedValue(unavailable),
      }),
    ).resolves.toEqual({ ok: true, projectionPending: true });
    await expect(
      restoreMapForUser('user', INPUT, {
        ...common,
        restoreMap: vi.fn().mockResolvedValue(true),
        projectAccess: vi.fn().mockRejectedValue(unavailable),
      }),
    ).resolves.toEqual({ ok: true, projectionPending: true });
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it('rethrows unexpected projection failures', async () => {
    const failure = new Error('bug');
    await expect(
      restoreMapForUser('user', INPUT, {
        resolvePrincipals: vi.fn().mockResolvedValue(PRINCIPALS),
        restoreMap: vi.fn().mockResolvedValue(true),
        projectAccess: vi.fn().mockRejectedValue(failure),
      }),
    ).rejects.toBe(failure);
  });

  it('requests purge without any projection or hard-delete effect', async () => {
    const requestPurge = vi.fn().mockResolvedValue(true);
    await expect(
      requestMapPurgeForUser('creator', INPUT, { requestPurge }),
    ).resolves.toEqual({ ok: true });
    expect(requestPurge).toHaveBeenCalledWith('creator', 'map-1');
  });
});

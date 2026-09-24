import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectionUnavailableError } from './map-access-projection';
import {
  deleteMapForUser,
  requestMapPurgeForUser,
  restoreMapForUser,
  type MapLifecycleDependencies,
} from './map-lifecycle';

const INPUT = { mapId: 'map-1' };
const PRINCIPALS = { characterIds: [42], corporationIds: [99] };
const PENDING = { mapId: 'map-1', version: 'captured' };
const APPLIED = {
  inserted: 0,
  updated: 0,
  deleted: 1,
  unchanged: 0,
  outcome: 'applied' as const,
};
const STALE = { ...APPLIED, deleted: 0, outcome: 'stale' as const };

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  {
    transition: 'delete',
    run: deleteMapForUser,
    writeKey: 'archiveMap',
    otherWriteKey: 'restoreMap',
    label: '[maps] archived map projection pending resync',
  },
  {
    transition: 'restore',
    run: restoreMapForUser,
    writeKey: 'restoreMap',
    otherWriteKey: 'archiveMap',
    label: '[maps] restored map projection pending resync',
  },
] as const)('map lifecycle $transition', ({ run, writeKey, otherWriteKey, label }) => {
  function dependencies(
    write: unknown,
    overrides: Partial<MapLifecycleDependencies> = {},
  ): MapLifecycleDependencies {
    return {
      resolvePrincipals: vi.fn().mockResolvedValue(PRINCIPALS),
      [writeKey]: write,
      [otherWriteKey]: vi.fn().mockRejectedValue(new Error('wrong write')),
      ...overrides,
    };
  }

  it('writes, projects, then acknowledges the captured change', async () => {
    const order: string[] = [];
    const write = vi.fn(async () => {
      order.push('neon');
      return PENDING;
    });
    const acknowledgeAccess = vi.fn(async () => {
      order.push('acknowledge');
    });

    await expect(
      run('user', INPUT, dependencies(write, {
        projectAccess: vi.fn(async () => {
          order.push('projection');
          return APPLIED;
        }),
        acknowledgeAccess,
      })),
    ).resolves.toEqual({ ok: true, projectionPending: false });
    expect(write).toHaveBeenCalledWith('user', PRINCIPALS, 'map-1');
    expect(acknowledgeAccess).toHaveBeenCalledWith([PENDING]);
    expect(order).toEqual(['neon', 'projection', 'acknowledge']);
  });

  it('refuses unauthorized work without projecting', async () => {
    const projectAccess = vi.fn();
    const acknowledgeAccess = vi.fn();
    await expect(
      run('user', INPUT, dependencies(vi.fn().mockResolvedValue(null), {
        projectAccess,
        acknowledgeAccess,
      })),
    ).resolves.toEqual({ ok: false });
    expect(projectAccess).not.toHaveBeenCalled();
    expect(acknowledgeAccess).not.toHaveBeenCalled();
  });

  it('keeps the captured change pending and logs when projection is unavailable', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const cause = new ProjectionUnavailableError('offline');
    const acknowledgeAccess = vi.fn();
    await expect(
      run('user', INPUT, dependencies(vi.fn().mockResolvedValue(PENDING), {
        projectAccess: vi.fn().mockRejectedValue(cause),
        acknowledgeAccess,
      })),
    ).resolves.toEqual({ ok: true, projectionPending: true });
    expect(acknowledgeAccess).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(label, { mapId: 'map-1', cause });
  });

  it('marks projection pending when the projection is stale', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const acknowledgeAccess = vi.fn();
    await expect(
      run('user', INPUT, dependencies(vi.fn().mockResolvedValue(PENDING), {
        projectAccess: vi.fn().mockResolvedValue(STALE),
        acknowledgeAccess,
      })),
    ).resolves.toEqual({ ok: true, projectionPending: true });
    expect(acknowledgeAccess).not.toHaveBeenCalled();
    expect(error.mock.calls[0]?.[0]).toBe(label);
  });

  it('rethrows unexpected projection failures', async () => {
    const failure = new Error('bug');
    const acknowledgeAccess = vi.fn();
    await expect(
      run('user', INPUT, dependencies(vi.fn().mockResolvedValue(PENDING), {
        projectAccess: vi.fn().mockRejectedValue(failure),
        acknowledgeAccess,
      })),
    ).rejects.toBe(failure);
    expect(acknowledgeAccess).not.toHaveBeenCalled();
  });
});

describe('map lifecycle purge', () => {
  it('requests purge without any projection or hard-delete effect', async () => {
    const requestPurge = vi.fn().mockResolvedValue(true);
    await expect(
      requestMapPurgeForUser('creator', INPUT, { requestPurge }),
    ).resolves.toEqual({ ok: true });
    expect(requestPurge).toHaveBeenCalledWith('creator', 'map-1');
  });
});

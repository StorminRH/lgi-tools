import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock('@/transport/api-client', () => ({
  apiFetch: apiFetchMock,
}));

const SYSTEMS = [
  { id: 30000142, name: 'Jita', whClassId: 7, security: 0.9 },
];
const ADJACENCY = [[30000142, [30000144]]] as const;
const CODEX = [
  {
    code: 'B274',
    typeId: 30647,
    farSide: false,
    totalMass: 2_000_000_000,
    maxJumpMass: 375_000_000,
    massRegen: 0,
    lifetimeMinutes: 1440,
    sizeClass: 'L',
    targetClass: 7,
  },
  { code: 'K162', typeId: 30831, farSide: true },
] as const;

async function freshModule() {
  vi.resetModules();
  return await import('./universe-assets-client');
}

function installSuccess(version = '3444265') {
  apiFetchMock.mockImplementation(
    (endpoint: { path: string }) => {
      if (endpoint.path === '/api/universe/assets') {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { version },
        });
      }
      if (endpoint.path.endsWith('/systems')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { version, systems: SYSTEMS },
        });
      }
      if (endpoint.path.endsWith('/adjacency')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { version, adjacency: ADJACENCY },
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        data: { version, types: CODEX },
      });
    },
  );
}

describe('universe asset client loaders', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('memoizes one universe fetch set and exposes typed null-safe lookups', async () => {
    installSuccess();
    const assetModule = await freshModule();

    const first = await assetModule.loadUniverseAssets();
    const second = await assetModule.loadUniverseAssets();

    expect(second).toBe(first);
    expect(apiFetchMock).toHaveBeenCalledTimes(3);
    expect(first.systemInfo(30000142)?.name).toBe('Jita');
    expect(first.systemInfo(0)).toBeNull();
    expect(first.neighbours(30000142)).toEqual([30000144]);
    expect(first.neighbours(0)).toEqual([]);
  });

  it('refetches the manifest exactly once after a stale versioned asset', async () => {
    let manifestCalls = 0;
    apiFetchMock.mockImplementation(
      (
        endpoint: { path: string },
        init?: { params?: { version?: string } },
      ) => {
        if (endpoint.path === '/api/universe/assets') {
          manifestCalls += 1;
          return Promise.resolve({
            ok: true,
            status: 200,
            data: { version: manifestCalls === 1 ? 'old' : 'new' },
          });
        }
        if (endpoint.path.endsWith('/systems') && init?.params?.version === 'old') {
          return Promise.resolve({
            ok: false,
            kind: 'api',
            status: 404,
            error: {},
          });
        }
        if (endpoint.path.endsWith('/systems')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            data: { version: 'new', systems: SYSTEMS },
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { version: init?.params?.version, adjacency: ADJACENCY },
        });
      },
    );
    const assetModule = await freshModule();

    await expect(assetModule.loadUniverseAssets()).resolves.toMatchObject({
      version: 'new',
    });
    expect(manifestCalls).toBe(2);
    expect(apiFetchMock).toHaveBeenCalledTimes(6);
  });

  it('rejects and clears the universe memo when both asset attempts are stale', async () => {
    apiFetchMock.mockImplementation((endpoint: { path: string }) => {
      if (endpoint.path === '/api/universe/assets') {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { version: 'stale' },
        });
      }
      return Promise.resolve({
        ok: false,
        kind: 'api',
        status: 404,
        error: {},
      });
    });
    const assetModule = await freshModule();

    await expect(assetModule.loadUniverseAssets()).rejects.toThrow(
      'universe assets remained stale after one manifest refresh',
    );
    await expect(assetModule.loadUniverseAssets()).rejects.toThrow(
      'universe assets remained stale after one manifest refresh',
    );
    expect(apiFetchMock).toHaveBeenCalledTimes(12);
  });

  it('surfaces a parallel asset failure instead of masking it as stale', async () => {
    apiFetchMock.mockImplementation((endpoint: { path: string }) => {
      if (endpoint.path === '/api/universe/assets') {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { version: 'current' },
        });
      }
      if (endpoint.path.endsWith('/systems')) {
        return Promise.resolve({
          ok: false,
          kind: 'api',
          status: 404,
          error: {},
        });
      }
      return Promise.resolve({
        ok: false,
        kind: 'api',
        status: 500,
        error: {},
      });
    });
    const assetModule = await freshModule();

    await expect(assetModule.loadUniverseAssets()).rejects.toThrow(
      'universe assets api 500',
    );
    expect(apiFetchMock).toHaveBeenCalledTimes(3);
  });

  it('clears a rejected memo so the next call can heal', async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: false,
      kind: 'network',
      aborted: false,
      cause: new Error('offline'),
    });
    const assetModule = await freshModule();

    await expect(assetModule.loadUniverseAssets()).rejects.toThrow(
      /universe asset manifest network/,
    );
    installSuccess();
    await expect(assetModule.loadUniverseAssets()).resolves.toMatchObject({
      version: '3444265',
    });
  });

  it('memoizes the codex independently and resolves known and unknown codes', async () => {
    installSuccess();
    const assetModule = await freshModule();

    const first = await assetModule.loadWormholeCodex();
    const second = await assetModule.loadWormholeCodex();

    expect(second).toBe(first);
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
    expect(first.byCode('B274')).toMatchObject({
      maxJumpMass: 375_000_000,
      sizeClass: 'L',
    });
    expect(first.byCode('K162')).toEqual({
      code: 'K162',
      typeId: 30831,
      farSide: true,
    });
    expect(first.byCode('NOPE')).toBeNull();
  });

  it('exposes one typeahead code per SDE clone cluster and prefers the lowest typeId', async () => {
    apiFetchMock.mockImplementation((endpoint: { path: string }) => {
      if (endpoint.path === '/api/universe/assets') {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { version: '3444265' },
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        data: {
          version: '3444265',
          types: [
            {
              code: 'C729',
              typeId: 56546,
              farSide: false,
              totalMass: 1_000_000_000,
              maxJumpMass: 410_000_000,
              massRegen: 0,
              lifetimeMinutes: 720,
              sizeClass: 'L',
              targetClass: -1,
            },
            {
              code: 'C729',
              typeId: 56026,
              farSide: false,
              totalMass: 1_000_000_000,
              maxJumpMass: 410_000_000,
              massRegen: 0,
              lifetimeMinutes: 720,
              sizeClass: 'L',
              targetClass: -1,
            },
            { code: 'K162', typeId: 30831, farSide: true },
          ],
        },
      });
    });
    const assetModule = await freshModule();
    const codex = await assetModule.loadWormholeCodex();

    expect(codex.codes()).toEqual(['C729', 'K162']);
    expect(codex.byCode('C729')?.typeId).toBe(56026);
  });

  it('refetches the manifest once when the codex version is stale', async () => {
    let manifestCalls = 0;
    apiFetchMock.mockImplementation(
      (
        endpoint: { path: string },
        init?: { params?: { version?: string } },
      ) => {
        if (endpoint.path === '/api/universe/assets') {
          manifestCalls += 1;
          return Promise.resolve({
            ok: true,
            status: 200,
            data: { version: manifestCalls === 1 ? 'old' : 'new' },
          });
        }
        if (init?.params?.version === 'old') {
          return Promise.resolve({
            ok: false,
            kind: 'api',
            status: 404,
            error: {},
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { version: 'new', types: CODEX },
        });
      },
    );
    const assetModule = await freshModule();

    await expect(assetModule.loadWormholeCodex()).resolves.toMatchObject({
      version: 'new',
    });
    expect(manifestCalls).toBe(2);
    expect(apiFetchMock).toHaveBeenCalledTimes(4);
  });

  it('rejects and clears the codex memo when both attempts are stale', async () => {
    apiFetchMock.mockImplementation((endpoint: { path: string }) => {
      if (endpoint.path === '/api/universe/assets') {
        return Promise.resolve({
          ok: true,
          status: 200,
          data: { version: 'stale' },
        });
      }
      return Promise.resolve({
        ok: false,
        kind: 'api',
        status: 404,
        error: {},
      });
    });
    const assetModule = await freshModule();

    await expect(assetModule.loadWormholeCodex()).rejects.toThrow(
      'wormhole codex remained stale after one manifest refresh',
    );
    await expect(assetModule.loadWormholeCodex()).rejects.toThrow(
      'wormhole codex remained stale after one manifest refresh',
    );
    expect(apiFetchMock).toHaveBeenCalledTimes(8);
  });
});

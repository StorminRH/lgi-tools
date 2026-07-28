import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  connectionMock,
  getCachedSdeVersionMock,
  getSystemDirectoryMock,
  getAdjacencyGraphMock,
  getWormholeCodexMock,
} = vi.hoisted(() => ({
  connectionMock: vi.fn(),
  getCachedSdeVersionMock: vi.fn(),
  getSystemDirectoryMock: vi.fn(),
  getAdjacencyGraphMock: vi.fn(),
  getWormholeCodexMock: vi.fn(),
}));

vi.mock('next/server', () => ({
  connection: connectionMock,
}));

vi.mock('@/data/eve-data/meta', () => ({
  getCachedSdeVersion: getCachedSdeVersionMock,
}));

vi.mock('@/data/eve-data/universe-assets', () => ({
  getSystemDirectory: getSystemDirectoryMock,
  getAdjacencyGraph: getAdjacencyGraphMock,
  getWormholeCodex: getWormholeCodexMock,
}));

const VERSION = '3444265';
const IMMUTABLE = 'public, max-age=31536000, immutable';

describe('GET /api/universe/assets', () => {
  beforeEach(() => {
    connectionMock.mockReset();
    getCachedSdeVersionMock.mockReset();
    getSystemDirectoryMock.mockReset();
    getAdjacencyGraphMock.mockReset();
    getWormholeCodexMock.mockReset();
    connectionMock.mockResolvedValue(undefined);
  });

  it('returns the current version with no-store caching', async () => {
    getCachedSdeVersionMock.mockResolvedValue({
      version: VERSION,
      ingestedAt: new Date(),
    });
    const { GET } = await import('./route');
    const response = await GET();

    expect(connectionMock).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ version: VERSION });
  });

  it('returns a no-store 503 problem when no SDE version is present', async () => {
    getCachedSdeVersionMock.mockResolvedValue({
      version: null,
      ingestedAt: null,
    });
    const { GET } = await import('./route');
    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      status: 503,
      code: 'sde_unavailable',
    });
  });

  it.each([
    {
      label: 'systems',
      importRoute: () => import('./[version]/systems/route'),
      read: getSystemDirectoryMock,
      asset: { version: VERSION, systems: [] },
    },
    {
      label: 'adjacency',
      importRoute: () => import('./[version]/adjacency/route'),
      read: getAdjacencyGraphMock,
      asset: { version: VERSION, adjacency: [] },
    },
    {
      label: 'wormholes',
      importRoute: () => import('./[version]/wormholes/route'),
      read: getWormholeCodexMock,
      asset: { version: VERSION, types: [] },
    },
  ])(
    'serves matching $label immutably and rejects a stale version',
    async ({ importRoute, read, asset }) => {
      read.mockResolvedValue(asset);
      const { GET } = await importRoute();

      const matching = await GET(
        new Request('http://localhost'),
        { params: Promise.resolve({ version: VERSION }) },
      );
      expect(matching.status).toBe(200);
      expect(matching.headers.get('Cache-Control')).toBe(IMMUTABLE);
      await expect(matching.json()).resolves.toEqual(asset);

      const stale = await GET(
        new Request('http://localhost'),
        { params: Promise.resolve({ version: 'old' }) },
      );
      expect(stale.status).toBe(404);
      await expect(stale.json()).resolves.toMatchObject({
        status: 404,
        code: 'asset_version_not_found',
      });
    },
  );
});

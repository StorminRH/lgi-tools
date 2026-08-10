import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSystemStaticsMock } = vi.hoisted(() => ({
  getSystemStaticsMock: vi.fn(),
}));

vi.mock('@/data/wh-statics/queries', () => ({
  getSystemStatics: getSystemStaticsMock,
}));

describe('GET /api/universe/statics/[systemId]', () => {
  beforeEach(() => {
    getSystemStaticsMock.mockReset();
    getSystemStaticsMock.mockResolvedValue({
      version: 'promoted-v1',
      systems: [
        { systemId: 31_000_001, codes: ['B274', 'N770'] },
      ],
    });
  });

  it('serves one system from the promoted statics cache and treats misses as empty', async () => {
    const { GET } = await import('./route');
    const matching = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ systemId: '31000001' }),
    });
    expect(matching.status).toBe(200);
    await expect(matching.json()).resolves.toEqual({
      statics: ['B274', 'N770'],
    });

    const unknown = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ systemId: '31000002' }),
    });
    await expect(unknown.json()).resolves.toEqual({ statics: [] });

    const invalid = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ systemId: 'not-a-system' }),
    });
    await expect(invalid.json()).resolves.toEqual({ statics: [] });
    expect(getSystemStaticsMock).toHaveBeenCalledTimes(2);
  });
});

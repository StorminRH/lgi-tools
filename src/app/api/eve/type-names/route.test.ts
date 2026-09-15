import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getTypeNamesMock } = vi.hoisted(() => ({
  getTypeNamesMock: vi.fn(),
}));

vi.mock('@/data/eve-data/queries', () => ({
  getTypeNames: getTypeNamesMock,
}));

vi.mock('@/app/api/capability-route', () => ({
  capabilityRoute: (_id: string, handler: (request: Request) => Promise<Response>) => handler,
}));

describe('POST /api/eve/type-names', () => {
  beforeEach(() => {
    getTypeNamesMock.mockReset();
  });

  it('returns names from getTypeNames and omits unknown ids', async () => {
    getTypeNamesMock.mockResolvedValue(new Map([[587, 'Rifter']]));
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/eve/type-names', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [587, 1] }),
      }),
    );

    expect(getTypeNamesMock).toHaveBeenCalledWith([587, 1]);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      names: { '587': 'Rifter' },
    });
  });

  it('rejects an empty ids array', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/eve/type-names', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [] }),
      }),
    );

    expect(getTypeNamesMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: 'invalid_body',
    });
  });
});

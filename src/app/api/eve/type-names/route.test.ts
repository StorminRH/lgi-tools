import { expect, test, vi } from 'vitest';

const { getTypeNamesMock } = vi.hoisted(() => ({ getTypeNamesMock: vi.fn() }));
vi.mock('@/data/eve-data/queries', () => ({ getTypeNames: getTypeNamesMock }));
vi.mock('@/app/api/capability-route', () => ({
  capabilityRoute: (_id: string, handler: (request: Request) => Promise<Response>) => handler,
}));

test('resolves a bounded set of ship names and rejects invalid input before querying', async () => {
  getTypeNamesMock.mockReset().mockResolvedValue(new Map([[587, 'Rifter']]));
  const { POST } = await import('./route');
  const request = (body: string) => new Request('http://localhost/api/eve/type-names', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body,
  });
  const response = await POST(request(JSON.stringify({ ids: [587, 1, 587] })));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ names: { '587': 'Rifter' } });
  expect(getTypeNamesMock).toHaveBeenCalledWith([587, 1]);
  for (const body of ['{', JSON.stringify({ ids: [] }), JSON.stringify({ ids: [-1] }), JSON.stringify({ ids: Array(201).fill(587) })]) {
    expect((await POST(request(body))).status).toBe(400);
  }
  expect(getTypeNamesMock).toHaveBeenCalledTimes(1);
});

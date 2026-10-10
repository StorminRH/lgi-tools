import { expect, test, vi } from 'vitest';
import { postJson } from '@/lib/__tests__/route-requests';

const ROUTE = '/api/eve/type-names';

const { getTypeNamesMock } = vi.hoisted(() => ({ getTypeNamesMock: vi.fn() }));
vi.mock('@/data/eve-data/queries', () => ({ getTypeNames: getTypeNamesMock }));
vi.mock('@/app/api/capability-route', () => ({
  capabilityRoute: (_id: string, handler: (request: Request) => Promise<Response>) => handler,
}));

test('resolves a bounded set of ship names and rejects invalid input before querying', async () => {
  getTypeNamesMock.mockReset().mockResolvedValue(new Map([[587, 'Rifter']]));
  const { POST } = await import('./route');
  const response = await POST(postJson(ROUTE, { ids: [587, 1, 587] }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ names: { '587': 'Rifter' } });
  expect(getTypeNamesMock).toHaveBeenCalledWith([587, 1]);
  for (const body of ['{', { ids: [] }, { ids: [-1] }, { ids: Array(201).fill(587) }]) {
    expect((await POST(postJson(ROUTE, body))).status).toBe(400);
  }
  expect(getTypeNamesMock).toHaveBeenCalledTimes(1);
});

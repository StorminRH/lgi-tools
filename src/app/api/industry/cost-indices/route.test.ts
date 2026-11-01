import { expect, test, vi } from 'vitest';
import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';

const getSystemCostIndicesBatchMock = vi.fn();

vi.mock('@/data/industry-indices/queries', () => ({ getAdjustedPrices: vi.fn() }));
vi.mock('@/data/industry-indices/on-view', () => ({
  getSystemCostIndicesOnView: (systemIds: number[]) => getSystemCostIndicesBatchMock(systemIds),
}));

import { POST } from './route';

const ROUTE = '/api/industry/cost-indices';

test('rejects a non-JSON body, a bad system id and too many systems before reading', async () => {
  getSystemCostIndicesBatchMock.mockReset();
  for (const [body, code] of [
    ['not json', 'invalid_json'],
    [{ systemIds: [-1] }, 'invalid_body'],
    [{ systemIds: Array.from({ length: 65 }, (_, i) => i + 1) }, 'invalid_body'],
  ] as const) {
    const res = await POST(postJson(ROUTE, body));
    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({ code });
  }
  expect(getSystemCostIndicesBatchMock).not.toHaveBeenCalled();
});

test('answers each system once, in the order asked, null where it has no index', async () => {
  getSystemCostIndicesBatchMock.mockReset().mockResolvedValue(
    new Map([
      [30004759, new Map([['manufacturing', 0.0512], ['reaction', 0.0231]])],
      [30000142, new Map([['manufacturing', 0.1]])],
    ]),
  );
  const res = await POST(postJson(ROUTE, { systemIds: [30000142, 30004759, 30000142, 31000005] }));
  expect(res.status).toBe(200);
  expect(getSystemCostIndicesBatchMock).toHaveBeenCalledWith([30000142, 30004759, 31000005]);
  expect(await res.json()).toEqual({
    systems: [
      { systemId: 30000142, manufacturing: 0.1, reaction: null },
      { systemId: 30004759, manufacturing: 0.0512, reaction: 0.0231 },
      { systemId: 31000005, manufacturing: null, reaction: null },
    ],
  });
});

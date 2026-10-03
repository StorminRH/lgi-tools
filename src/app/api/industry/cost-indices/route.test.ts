import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { problemBodySchema } from '@/lib/problem';

const getSystemCostIndicesBatchMock = vi.fn();

vi.mock('@/data/industry-indices/queries', () => ({
  getAdjustedPrices: vi.fn(),
  getSystemCostIndices: vi.fn(),
  getSystemCostIndicesBatch: (systemIds: number[]) => getSystemCostIndicesBatchMock(systemIds),
}));

import { POST } from './route';

function buildRequest(body: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/industry/cost-indices', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

describe('POST /api/industry/cost-indices', () => {
  beforeEach(() => {
    getSystemCostIndicesBatchMock.mockReset();
  });

  it('returns 400 invalid_json for a non-JSON body', async () => {
    const res = await POST(buildRequest('not json'));
    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({ code: 'invalid_json' });
  });

  it('returns 400 invalid_body for a bad system id or too many systems', async () => {
    for (const systemIds of [[-1], Array.from({ length: 65 }, (_, i) => i + 1)]) {
      const res = await POST(buildRequest(JSON.stringify({ systemIds })));
      expect(res.status).toBe(400);
      expect(problemBodySchema.parse(await res.json())).toMatchObject({ code: 'invalid_body' });
    }
    expect(getSystemCostIndicesBatchMock).not.toHaveBeenCalled();
  });

  it('answers each system once, in the order asked, null where it has no index', async () => {
    getSystemCostIndicesBatchMock.mockResolvedValue(
      new Map([
        [30004759, new Map([['manufacturing', 0.0512], ['reaction', 0.0231]])],
        [30000142, new Map([['manufacturing', 0.1]])],
      ]),
    );
    const res = await POST(buildRequest(JSON.stringify({ systemIds: [30000142, 30004759, 30000142, 31000005] })));
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
});

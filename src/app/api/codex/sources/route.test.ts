import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  getWormholeCodex: vi.fn(),
  getPricedSiteDetail: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({ checkUserId: () => h.checkUserId() }));
vi.mock('next/cache', () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock('@/data/eve-data/universe-assets', () => ({
  getWormholeCodex: h.getWormholeCodex,
  getSystemDirectory: vi.fn(),
}));
vi.mock('@/data/wh-statics/queries', () => ({ getSystemStatics: vi.fn() }));
vi.mock('@/features/wormhole-sites/queries', () => ({
  getPricedSiteDetail: h.getPricedSiteDetail,
  getSiteSearchIndex: vi.fn(),
}));
vi.mock('@/data/eve-data/queries', () => ({
  getTypeLabels: vi.fn(),
  getTypesByIds: vi.fn(),
  searchPublishedTypesByName: vi.fn(),
}));
vi.mock('@/data/telemetry/queries', () => ({ logUsageEvent: vi.fn().mockResolvedValue(undefined) }));

import { unauthenticatedFailure } from '@/lib/failure';
import { GET } from './route';

const C247 = {
  code: 'C247',
  typeId: 30691,
  farSide: false,
  totalMass: 2_000_000_000,
  maxJumpMass: 375_000_000,
  massRegen: 0,
  lifetimeMinutes: 960,
  sizeClass: 'L',
  targetClass: 3,
};

async function get(query: string) {
  const response = await GET(new NextRequest(`http://localhost:3000/api/codex/sources?${query}`));
  return { status: response.status, body: await response.json() };
}

describe('GET /api/codex/sources', () => {
  beforeEach(() => {
    h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
    h.getWormholeCodex.mockResolvedValue({ version: 'v', types: [C247], effects: [] });
  });

  it('serves only signed-in pilots', async () => {
    h.checkUserId.mockResolvedValue({ ok: false, failure: unauthenticatedFailure() });
    const { status, body } = await get('source=wormholeType&q=C2');
    expect(status).toBe(401);
    expect(body.code).toBe('unauthenticated');
  });

  it('rejects unknown sources, missing search text, and bad keys', async () => {
    expect(await get('source=users&q=a')).toMatchObject({ status: 400, body: { code: 'unknown_source' } });
    expect(await get('source=wormholeType')).toMatchObject({ status: 400, body: { code: 'invalid_query' } });
    expect(await get('source=site&key=0')).toMatchObject({ status: 400, body: { code: 'invalid_key' } });
    expect(await get('source=eveType&key=99999999999')).toMatchObject({ status: 400, body: { code: 'invalid_key' } });
    expect(await get('source=site&key=2147483648')).toMatchObject({ status: 400, body: { code: 'invalid_key' } });
  });

  it('searches a source', async () => {
    expect(await get('source=wormholeType&q=C2')).toEqual({
      status: 200,
      body: { hits: [{ key: 'C247', title: 'C247', hint: 'Leads to C3 · Large' }] },
    });
    expect(await get('source=wormholeType&q=zzzz')).toEqual({ status: 200, body: { hits: [] } });
  });

  it('loads one entity with every field formatted, or 404s a missing one', async () => {
    const { status, body } = await get('source=wormholeType&key=c247');
    expect(status).toBe(200);
    expect(body.entity).toMatchObject({ key: 'C247', title: 'C247', href: null });
    expect(body.entity.values).toHaveLength(6);
    expect(body.entity.values[1]).toEqual({ field: 'totalMass', label: 'Total mass', value: '2,000,000,000 kg' });

    const missing = await get('source=wormholeType&key=C999');
    expect(missing).toMatchObject({ status: 404, body: { code: 'entity_not_found' } });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkUserId: vi.fn(),
  searchUpwellStructures: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/composition/structure-search', () => ({
  searchUpwellStructures: (...args: unknown[]) => h.searchUpwellStructures(...args),
}));

import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

const HIT = { structureId: 1_035_000_000_001, name: 'Sobaseki - Industry Azbel', systemId: 30001363, structureTypeId: 35826 };

const ROUTE = '/api/account/custom-structures/search';

beforeEach(() => {
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.searchUpwellStructures.mockReset().mockResolvedValue([HIT]);
});

describe('POST /api/account/custom-structures/search', () => {
  it('returns 401 for an anonymous caller', async () => {
    h.checkUserId.mockResolvedValue({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    expect((await POST(postJson(ROUTE, { search: 'Sobaseki' }))).status).toBe(401);
    expect(h.searchUpwellStructures).not.toHaveBeenCalled();
  });

  it('refuses a cross-origin search before reading the body or searching ESI', async () => {
    const res = await POST(postJson(ROUTE, '{not json', { origin: 'https://foreign.example' }));
    expect(res.status).toBe(403);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({ code: 'cross_origin' });
    expect(h.searchUpwellStructures).not.toHaveBeenCalled();
  });

  it('returns 400 below the three-character ESI minimum', async () => {
    expect((await POST(postJson(ROUTE, { search: 'So' }))).status).toBe(400);
    expect(h.searchUpwellStructures).not.toHaveBeenCalled();
  });

  it('returns the resolved structures for the caller', async () => {
    const request = postJson(ROUTE, { search: '  Sobaseki ' }, { origin: 'http://localhost:3000' });
    const res = await POST(request);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [HIT] });
    expect(h.searchUpwellStructures).toHaveBeenCalledWith('user-1', 'Sobaseki', request.signal);
  });

  it('returns 503 when ESI is unavailable', async () => {
    h.searchUpwellStructures.mockRejectedValue(new Error('ESI structure search failed (502)'));
    const res = await POST(postJson(ROUTE, { search: 'Sobaseki' }));
    expect(res.status).toBe(503);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({ code: 'structure_search_unavailable' });
  });
});

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

import { NextRequest } from 'next/server';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

const HIT = { structureId: 1_035_000_000_001, name: 'Sobaseki - Industry Azbel', systemId: 30001363, structureTypeId: 35826 };

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/custom-structures/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

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
    expect((await POST(makeRequest({ search: 'Sobaseki' }))).status).toBe(401);
    expect(h.searchUpwellStructures).not.toHaveBeenCalled();
  });

  it('returns 400 below the three-character ESI minimum', async () => {
    expect((await POST(makeRequest({ search: 'So' }))).status).toBe(400);
    expect(h.searchUpwellStructures).not.toHaveBeenCalled();
  });

  it('returns the resolved structures for the caller', async () => {
    const res = await POST(makeRequest({ search: '  Sobaseki ' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [HIT] });
    expect(h.searchUpwellStructures).toHaveBeenCalledWith('user-1', 'Sobaseki', expect.any(AbortSignal));
  });

  it('returns 503 when ESI is unavailable', async () => {
    h.searchUpwellStructures.mockRejectedValue(new Error('ESI structure search failed (502)'));
    const res = await POST(makeRequest({ search: 'Sobaseki' }));
    expect(res.status).toBe(503);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({ code: 'structure_search_unavailable' });
  });
});

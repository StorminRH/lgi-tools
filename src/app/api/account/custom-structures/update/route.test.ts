import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireUserIdMock: vi.fn(),
  rejectInvalidMock: vi.fn(),
  updateCustomStructureMock: vi.fn(),
  listCustomStructuresMock: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.requireUserIdMock(...args),
}));
vi.mock('@/features/custom-structures/system-pin', () => ({
  rejectInvalidCustomStructure: (...args: unknown[]) => h.rejectInvalidMock(...args),
}));
vi.mock('@/features/custom-structures/queries', () => ({
  updateCustomStructure: (...args: unknown[]) => h.updateCustomStructureMock(...args),
  listCustomStructures: (...args: unknown[]) => h.listCustomStructuresMock(...args),
}));

import { NextRequest } from 'next/server';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

const BODY = {
  id: 'cs-1',
  name: 'Sobaseki Azbel',
  structureTypeId: 35826,
  rigTypeIds: [],
  systemId: 30000142,
  taxPct: 1,
  bonuses: { manufacturing: { me: 3.38, te: 39.2, cost: 4 }, reactions: { me: 0, te: 0 } },
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/custom-structures/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.requireUserIdMock.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.rejectInvalidMock.mockReset().mockResolvedValue({ ok: true });
  h.updateCustomStructureMock.mockReset().mockResolvedValue(undefined);
  h.listCustomStructuresMock.mockReset().mockResolvedValue([BODY]);
});

describe('POST /api/account/custom-structures/update', () => {
  it('returns 401 for an anonymous caller', async () => {
    h.requireUserIdMock.mockResolvedValue({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    expect((await POST(makeRequest(BODY))).status).toBe(401);
    expect(h.updateCustomStructureMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the save boundary rejects the structure', async () => {
    h.rejectInvalidMock.mockResolvedValue({
      ok: false,
      failure: { category: 'validation', code: 'unknown_system', detail: 'unknown system' },
    });
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({ code: 'unknown_system' });
    expect(h.updateCustomStructureMock).not.toHaveBeenCalled();
  });

  it('returns 400 for entered bonuses alongside rigs', async () => {
    const res = await POST(makeRequest({ ...BODY, rigTypeIds: [37170] }));
    expect(res.status).toBe(400);
    expect(h.updateCustomStructureMock).not.toHaveBeenCalled();
  });

  it('overwrites the owned row and returns the list', async () => {
    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ structures: [BODY] });
    const { id, ...fields } = BODY;
    expect(h.updateCustomStructureMock).toHaveBeenCalledWith('user-1', id, fields);
  });
});

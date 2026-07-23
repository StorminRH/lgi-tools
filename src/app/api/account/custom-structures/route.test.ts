import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireUserIdMock: vi.fn(),
  getStructureTypesMock: vi.fn(),
  getStructureRigsMock: vi.fn(),
  solarSystemExistsMock: vi.fn(),
  countCustomStructuresMock: vi.fn(),
  createCustomStructureMock: vi.fn(),
  listCustomStructuresMock: vi.fn(),
}));

vi.mock('@/platform/auth/route-guards', () => ({
  requireUserId: (...args: unknown[]) => h.requireUserIdMock(...args),
}));
vi.mock('@/data/eve-data/queries', () => ({
  getStructureTypes: (...args: unknown[]) => h.getStructureTypesMock(...args),
  getStructureRigs: (...args: unknown[]) => h.getStructureRigsMock(...args),
  solarSystemExists: (...args: unknown[]) => h.solarSystemExistsMock(...args),
}));
vi.mock('@/features/custom-structures/queries', () => ({
  countCustomStructures: (...args: unknown[]) => h.countCustomStructuresMock(...args),
  createCustomStructure: (...args: unknown[]) => h.createCustomStructureMock(...args),
  listCustomStructures: (...args: unknown[]) => h.listCustomStructuresMock(...args),
}));

import type { NextRequest } from 'next/server';
import { MAX_CUSTOM_STRUCTURES_PER_USER } from '@/features/custom-structures/api-contract';
import { POST } from './route';

// SDE fixtures: an Azbel (group 1404, L rigs) + one fitting L manufacturing rig.
const azbel = { typeId: 35826, name: 'Azbel', groupId: 1404, rigSize: 3 };
const lMfgRig = {
  typeId: 37170,
  name: 'L-Set Equipment Mfg Eff I',
  canFitGroups: [1657, 1404, 1406],
  rigSize: 3,
};

const savedRow = {
  id: 'cs-1',
  name: 'Home Azbel',
  structureTypeId: 35826,
  rigTypeIds: [37170],
  systemId: 30000142,
  taxPct: 1,
};

function makeRequest(body: unknown): NextRequest {
  return new Request('http://localhost:3000/api/account/custom-structures', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const VALID_BODY = {
  name: 'Home Azbel',
  structureTypeId: 35826,
  rigTypeIds: [37170],
  systemId: 30000142,
  taxPct: 1,
};

beforeEach(() => {
  h.requireUserIdMock.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.getStructureTypesMock.mockReset().mockResolvedValue([azbel]);
  h.getStructureRigsMock.mockReset().mockResolvedValue([lMfgRig]);
  h.solarSystemExistsMock.mockReset().mockResolvedValue(true);
  h.countCustomStructuresMock.mockReset().mockResolvedValue(0);
  h.createCustomStructureMock.mockReset().mockResolvedValue(undefined);
  h.listCustomStructuresMock.mockReset().mockResolvedValue([savedRow]);
});

describe('POST /api/account/custom-structures', () => {
  it('returns 401 for an anonymous caller', async () => {
    h.requireUserIdMock.mockResolvedValue({
      ok: false,
      response: new Response('Unauthorized', { status: 401 }),
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(h.createCustomStructureMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid body', async () => {
    const res = await POST(makeRequest({ name: 'no type id' }));
    expect(res.status).toBe(400);
    expect(h.createCustomStructureMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a selection that fails validation', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, structureTypeId: 99999 }));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('unknown structure type');
  });

  it('returns 400 for a pin to an unknown system', async () => {
    h.solarSystemExistsMock.mockResolvedValue(false);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('unknown system');
  });

  it('returns 409 when the per-user cap is reached', async () => {
    h.countCustomStructuresMock.mockResolvedValue(MAX_CUSTOM_STRUCTURES_PER_USER);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
    expect(await res.text()).toBe('structure limit reached');
    expect(h.createCustomStructureMock).not.toHaveBeenCalled();
  });

  it('saves the structure and returns the updated list with 201', async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ structures: [savedRow] });
    expect(h.createCustomStructureMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        name: 'Home Azbel',
        structureTypeId: 35826,
        rigTypeIds: [37170],
        systemId: 30000142,
        taxPct: 1,
      }),
    );
  });
});

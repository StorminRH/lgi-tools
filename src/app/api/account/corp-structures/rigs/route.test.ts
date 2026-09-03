import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireUserIdMock: vi.fn(),
  stationManagerGateMock: vi.fn(),
  getCorpStructuresMock: vi.fn(),
  getCorpStructureRigsMock: vi.fn(),
  upsertCorpStructureRigsMock: vi.fn(),
  getStructureTypesMock: vi.fn(),
  getStructureRigsMock: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.requireUserIdMock(...args),
}));
vi.mock('@/composition/sync/corp-structures-sync', () => ({
  stationManagerGate: (...args: unknown[]) => h.stationManagerGateMock(...args),
}));
vi.mock('@/features/owned-structures/queries', () => ({
  getCorpStructures: (...args: unknown[]) => h.getCorpStructuresMock(...args),
  getCorpStructureRigs: (...args: unknown[]) => h.getCorpStructureRigsMock(...args),
  upsertCorpStructureRigs: (...args: unknown[]) => h.upsertCorpStructureRigsMock(...args),
}));
vi.mock('@/data/eve-data/queries', () => ({
  getStructureTypes: (...args: unknown[]) => h.getStructureTypesMock(...args),
  getStructureRigs: (...args: unknown[]) => h.getStructureRigsMock(...args),
}));

import { NextRequest } from 'next/server';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

const azbel = { typeId: 35826, name: 'Azbel', groupId: 1404, rigSize: 3 };
const lMfgRig = {
  typeId: 37170,
  name: 'L-Set Equipment Mfg Eff I',
  canFitGroups: [1657, 1404, 1406],
  rigSize: 3,
};
const corpStructure = {
  structureId: 1001,
  typeId: 35826,
  systemId: 30000142,
  securityClass: 'lowsec',
  name: 'Perimeter Fort',
};

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/account/corp-structures/rigs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const VALID_BODY = { corporationId: 2001, structureId: 1001, rigTypeIds: [37170], taxPct: 1.5 };

beforeEach(() => {
  h.requireUserIdMock.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.stationManagerGateMock.mockReset().mockResolvedValue({ ok: true });
  h.getCorpStructuresMock.mockReset().mockResolvedValue(new Map([[2001, [corpStructure]]]));
  h.getCorpStructureRigsMock
    .mockReset()
    .mockResolvedValue(new Map([[1001, { rigTypeIds: [37170], taxPct: 1.5 }]]));
  h.upsertCorpStructureRigsMock.mockReset().mockResolvedValue(undefined);
  h.getStructureTypesMock.mockReset().mockResolvedValue([azbel]);
  h.getStructureRigsMock.mockReset().mockResolvedValue([lMfgRig]);
});

describe('POST /api/account/corp-structures/rigs', () => {
  it('returns 401 for an anonymous caller', async () => {
    h.requireUserIdMock.mockResolvedValue({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(h.upsertCorpStructureRigsMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid body', async () => {
    const res = await POST(makeRequest({ corporationId: 2001 }));
    expect(res.status).toBe(400);
    expect(h.stationManagerGateMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a structure the corp does not own', async () => {
    h.getCorpStructuresMock.mockResolvedValue(new Map());
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'invalid_structure',
      detail: 'Unknown structure for this corporation',
    });
  });

  it('returns 400 for a rig that does not fit the structure', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, rigTypeIds: [46490] }));
    expect(res.status).toBe(400);
    expect(problemBodySchema.parse(await res.json())).toMatchObject({
      code: 'invalid_structure',
      detail: 'One or more rigs do not fit this structure',
    });
    expect(h.upsertCorpStructureRigsMock).not.toHaveBeenCalled();
  });

  it('saves the rigs and echoes the stored completion', async () => {
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ structureId: 1001, rigTypeIds: [37170], taxPct: 1.5 });
    expect(h.upsertCorpStructureRigsMock).toHaveBeenCalledWith(2001, 1001, [37170], 1.5);
  });
});

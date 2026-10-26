import { beforeEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireUserIdMock: vi.fn(),
  stationManagerGateMock: vi.fn(),
  getCorpStructuresMock: vi.fn(),
  upsertCorpStructureRigsMock: vi.fn(),
  getStructureTypesMock: vi.fn(),
  getStructureRigsMock: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.requireUserIdMock(...args),
}));
vi.mock('@/composition/corp-role-gates', () => ({
  stationManagerGate: (...args: unknown[]) => h.stationManagerGateMock(...args),
}));
vi.mock('@/features/owned-structures/queries', () => ({
  getCorpStructures: (...args: unknown[]) => h.getCorpStructuresMock(...args),
  upsertCorpStructureRigs: (...args: unknown[]) => h.upsertCorpStructureRigsMock(...args),
}));
vi.mock('@/data/eve-data/queries', () => ({
  getStructureTypes: (...args: unknown[]) => h.getStructureTypesMock(...args),
  getStructureRigs: (...args: unknown[]) => h.getStructureRigsMock(...args),
}));

import { postJson } from '@/lib/__tests__/route-requests';
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

const ROUTE = '/api/account/corp-structures/rigs';

const VALID_BODY = { corporationId: 2001, structureId: 1001, rigTypeIds: [37170], taxPct: 1.5 };

beforeEach(() => {
  h.requireUserIdMock.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.stationManagerGateMock.mockReset().mockResolvedValue({ ok: true });
  h.getCorpStructuresMock.mockReset().mockResolvedValue(new Map([[2001, [corpStructure]]]));
  h.upsertCorpStructureRigsMock.mockReset().mockResolvedValue({ rigTypeIds: [37170], taxPct: 1.5 });
  h.getStructureTypesMock.mockReset().mockResolvedValue([azbel]);
  h.getStructureRigsMock.mockReset().mockResolvedValue([lMfgRig]);
});

test('returns 401 for an anonymous caller', async () => {
  h.requireUserIdMock.mockResolvedValue({
    ok: false,
    failure: { category: 'unauthenticated', code: 'unauthenticated' },
  });
  const res = await POST(postJson(ROUTE, VALID_BODY));
  expect(res.status).toBe(401);
  expect(h.upsertCorpStructureRigsMock).not.toHaveBeenCalled();
});

test('refuses an invalid body, an unowned structure, and a rig that does not fit before saving', async () => {
  const invalid = await POST(postJson(ROUTE, { corporationId: 2001 }));
  expect(invalid.status).toBe(400);
  expect(h.stationManagerGateMock).not.toHaveBeenCalled();

  const misfit = await POST(postJson(ROUTE, { ...VALID_BODY, rigTypeIds: [46490] }));
  expect(misfit.status).toBe(400);
  expect(problemBodySchema.parse(await misfit.json())).toMatchObject({
    code: 'invalid_structure',
    detail: 'One or more rigs do not fit this structure',
  });

  h.getCorpStructuresMock.mockResolvedValue(new Map());
  const unowned = await POST(postJson(ROUTE, VALID_BODY));
  expect(unowned.status).toBe(400);
  expect(problemBodySchema.parse(await unowned.json())).toMatchObject({
    code: 'invalid_structure',
    detail: 'Unknown structure for this corporation',
  });
  expect(h.upsertCorpStructureRigsMock).not.toHaveBeenCalled();
});

test('saves the rigs and echoes the stored completion', async () => {
  const res = await POST(postJson(ROUTE, VALID_BODY));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ structureId: 1001, rigTypeIds: [37170], taxPct: 1.5 });
  expect(h.upsertCorpStructureRigsMock).toHaveBeenCalledWith(2001, 1001, [37170], 1.5);

  // A rig-only save sends no tax; the answer carries the tax the row kept.
  h.upsertCorpStructureRigsMock.mockResolvedValue({ rigTypeIds: [37170], taxPct: 2.5 });
  const rigOnlyRes = await POST(postJson(ROUTE, { corporationId: 2001, structureId: 1001, rigTypeIds: [37170] }));
  expect(rigOnlyRes.status).toBe(200);
  expect(await rigOnlyRes.json()).toEqual({ structureId: 1001, rigTypeIds: [37170], taxPct: 2.5 });
  expect(h.upsertCorpStructureRigsMock).toHaveBeenLastCalledWith(2001, 1001, [37170], undefined);
});

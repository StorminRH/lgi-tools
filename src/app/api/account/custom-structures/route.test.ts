import { beforeEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireUserIdMock: vi.fn(),
  getStructureTypesMock: vi.fn(),
  getStructureRigsMock: vi.fn(),
  solarSystemExistsMock: vi.fn(),
  createCustomStructureMock: vi.fn(),
  listCustomStructuresMock: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.requireUserIdMock(...args),
}));
vi.mock('@/data/eve-data/queries', () => ({
  getStructureTypes: (...args: unknown[]) => h.getStructureTypesMock(...args),
  getStructureRigs: (...args: unknown[]) => h.getStructureRigsMock(...args),
  solarSystemExists: (...args: unknown[]) => h.solarSystemExistsMock(...args),
}));
vi.mock('@/features/custom-structures/queries', () => ({
  createCustomStructure: (...args: unknown[]) => h.createCustomStructureMock(...args),
  listCustomStructures: (...args: unknown[]) => h.listCustomStructuresMock(...args),
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

const savedRow = {
  id: 'cs-1',
  name: 'Home Azbel',
  structureTypeId: 35826,
  rigTypeIds: [37170],
  systemId: 30000142,
  taxPct: 1,
  bonuses: null,
};

const ROUTE = '/api/account/custom-structures';

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
  h.createCustomStructureMock.mockReset().mockResolvedValue(true);
  h.listCustomStructuresMock.mockReset().mockResolvedValue([savedRow]);
});

test('refuses an anonymous caller and an invalid body before saving', async () => {
  h.requireUserIdMock.mockResolvedValueOnce({
    ok: false,
    failure: { category: 'unauthenticated', code: 'unauthenticated' },
  });
  expect((await POST(postJson(ROUTE, VALID_BODY))).status).toBe(401);

  expect((await POST(postJson(ROUTE, { name: 'no type id' }))).status).toBe(400);
  expect(h.createCustomStructureMock).not.toHaveBeenCalled();
});

test('refuses an unknown structure type and an unknown system before the cap is ever checked', async () => {
  const unknownType = await POST(postJson(ROUTE, { ...VALID_BODY, structureTypeId: 99999 }));
  expect(unknownType.status).toBe(400);
  expect(problemBodySchema.parse(await unknownType.json())).toMatchObject({
    code: 'invalid_structure',
    detail: 'unknown structure type',
  });

  h.solarSystemExistsMock.mockResolvedValue(false);
  const unknownSystem = await POST(postJson(ROUTE, VALID_BODY));
  expect(unknownSystem.status).toBe(400);
  expect(problemBodySchema.parse(await unknownSystem.json())).toMatchObject({
    code: 'unknown_system',
    detail: 'unknown system',
  });
  expect(h.createCustomStructureMock).not.toHaveBeenCalled();
});

test('saves the structure, or entered bonuses without rigs, and returns the updated list with 201', async () => {
  const res = await POST(postJson(ROUTE, VALID_BODY));
  expect(res.status).toBe(201);
  const createdId = h.createCustomStructureMock.mock.calls[0]![1].id as string;
  expect(createdId).toMatch(/^[0-9a-f-]{36}$/);
  expect(await res.json()).toEqual({ structures: [savedRow], createdId });
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

  const bonuses = { manufacturing: { me: 3.38, te: 39.2, cost: 4 }, reactions: { me: 0, te: 0 } };
  const withBonuses = await POST(postJson(ROUTE, { ...VALID_BODY, rigTypeIds: [], bonuses }));
  expect(withBonuses.status).toBe(201);
  expect(h.createCustomStructureMock).toHaveBeenLastCalledWith(
    'user-1',
    expect.objectContaining({ rigTypeIds: [], bonuses }),
  );
});

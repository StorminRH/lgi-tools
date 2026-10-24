import { beforeEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getCurrentUserIdMock: vi.fn(),
  requireUserIdMock: vi.fn(),
  getBlueprintStructureMock: vi.fn(),
  createSavedPlanMock: vi.fn(),
  listSavedPlansMock: vi.fn(),
}));

vi.mock('@/composition/session', () => ({
  getCurrentUserId: (...args: unknown[]) => h.getCurrentUserIdMock(...args),
}));
vi.mock('@/composition/route-guards', () => ({
  checkUserId: (...args: unknown[]) => h.requireUserIdMock(...args),
}));
vi.mock('@/features/industry-planner/queries', () => ({
  getBlueprintStructure: (...args: unknown[]) => h.getBlueprintStructureMock(...args),
}));
vi.mock('@/features/industry-planner/saved-plans-queries', () => ({
  createSavedPlan: (...args: unknown[]) => h.createSavedPlanMock(...args),
  listSavedPlans: (...args: unknown[]) => h.listSavedPlansMock(...args),
}));

import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';
import { GET, POST } from './route';

const planRow = {
  id: 'plan-1',
  name: 'Hulk batch',
  favorite: false,
  blueprintTypeId: 22548,
  productTypeId: 22544,
  productName: 'Hulk',
  snapshot: { v: 1, blueprintTypeId: 22548 },
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const VALID_BODY = { name: 'Hulk batch', snapshot: { v: 1, blueprintTypeId: 22548 } };

const ROUTE = '/api/account/saved-plans';

beforeEach(() => {
  h.getCurrentUserIdMock.mockReset();
  h.requireUserIdMock.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.getBlueprintStructureMock
    .mockReset()
    .mockResolvedValue({ product: { typeId: 22544, name: 'Hulk' } });
  h.createSavedPlanMock.mockReset().mockResolvedValue(true);
  h.listSavedPlansMock.mockReset().mockResolvedValue([planRow]);
});

test('GET fails soft for an anonymous caller and returns the caller-scoped plans when signed in', async () => {
  h.getCurrentUserIdMock.mockResolvedValue(null);
  const anonymous = await GET();
  expect(anonymous.status).toBe(200);
  expect(await anonymous.json()).toEqual({ plans: [] });
  expect(h.listSavedPlansMock).not.toHaveBeenCalled();

  h.getCurrentUserIdMock.mockResolvedValue('user-1');
  const signedIn = await GET();
  expect(signedIn.status).toBe(200);
  expect(await signedIn.json()).toEqual({ plans: [planRow] });
  expect(h.listSavedPlansMock).toHaveBeenCalledWith('user-1');
});

test('POST refuses an invalid body, malformed JSON, and an unknown blueprint before saving', async () => {
  const invalid = await POST(postJson(ROUTE, { name: 'no snapshot' }));
  expect(invalid.status).toBe(400);

  const malformed = await POST(postJson(ROUTE, '{not valid json'));
  expect(malformed.status).toBe(400);
  expect(problemBodySchema.parse(await malformed.json())).toMatchObject({
    code: 'invalid_json',
    detail: 'Invalid JSON',
  });
  expect(h.getBlueprintStructureMock).not.toHaveBeenCalled();

  h.getBlueprintStructureMock.mockResolvedValue(null);
  const unknown = await POST(postJson(ROUTE, VALID_BODY));
  expect(unknown.status).toBe(400);
  expect(problemBodySchema.parse(await unknown.json())).toMatchObject({
    code: 'unknown_blueprint',
    detail: 'unknown blueprint',
  });
  expect(h.createSavedPlanMock).not.toHaveBeenCalled();
});

test('POST saves the plan and returns the updated list with 201', async () => {
  const res = await POST(postJson(ROUTE, VALID_BODY));
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ plans: [planRow] });
  expect(h.createSavedPlanMock).toHaveBeenCalledWith(
    'user-1',
    expect.objectContaining({
      name: 'Hulk batch',
      blueprintTypeId: 22548,
      productTypeId: 22544,
      productName: 'Hulk',
      snapshot: { v: 1, blueprintTypeId: 22548 },
    }),
  );
});

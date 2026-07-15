import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getCurrentUserIdMock: vi.fn(),
  requireUserIdMock: vi.fn(),
  getBlueprintStructureMock: vi.fn(),
  countSavedPlansMock: vi.fn(),
  createSavedPlanMock: vi.fn(),
  deleteSavedPlanMock: vi.fn(),
  listSavedPlansMock: vi.fn(),
  logUsageEventMock: vi.fn(),
}));

vi.mock('@/features/auth/session', () => ({
  getCurrentUserId: (...args: unknown[]) => h.getCurrentUserIdMock(...args),
}));
vi.mock('@/features/auth/route-guards', () => ({
  requireUserId: (...args: unknown[]) => h.requireUserIdMock(...args),
}));
vi.mock('@/features/industry-planner/queries', () => ({
  getBlueprintStructure: (...args: unknown[]) => h.getBlueprintStructureMock(...args),
}));
vi.mock('@/features/industry-planner/saved-plans-queries', () => ({
  countSavedPlans: (...args: unknown[]) => h.countSavedPlansMock(...args),
  createSavedPlan: (...args: unknown[]) => h.createSavedPlanMock(...args),
  deleteSavedPlan: (...args: unknown[]) => h.deleteSavedPlanMock(...args),
  listSavedPlans: (...args: unknown[]) => h.listSavedPlansMock(...args),
}));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => h.logUsageEventMock(...args),
}));

import type { NextRequest } from 'next/server';
import { MAX_SAVED_PLANS_PER_USER } from '@/features/industry-planner/api-contract';
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

function makeRequest(body: unknown, origin?: string): NextRequest {
  return new Request('http://localhost:3000/api/account/saved-plans', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(origin ? { Origin: origin } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  h.getCurrentUserIdMock.mockReset();
  h.requireUserIdMock.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.getBlueprintStructureMock
    .mockReset()
    .mockResolvedValue({ product: { typeId: 22544, name: 'Hulk' } });
  h.countSavedPlansMock.mockReset();
  h.createSavedPlanMock.mockReset().mockResolvedValue(undefined);
  h.deleteSavedPlanMock.mockReset().mockResolvedValue(undefined);
  h.listSavedPlansMock.mockReset().mockResolvedValue([planRow]);
  h.logUsageEventMock.mockReset().mockResolvedValue(undefined);
});

describe('GET /api/account/saved-plans', () => {
  it('fails soft for an anonymous caller: 200 with an empty list', async () => {
    h.getCurrentUserIdMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plans: [] });
    expect(h.listSavedPlansMock).not.toHaveBeenCalled();
  });

  it('returns the caller-scoped plans when signed in', async () => {
    h.getCurrentUserIdMock.mockResolvedValue('user-1');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plans: [planRow] });
    expect(h.listSavedPlansMock).toHaveBeenCalledWith('user-1');
  });
});

describe('POST /api/account/saved-plans', () => {
  it('returns 401 for an anonymous caller', async () => {
    h.requireUserIdMock.mockResolvedValue({
      ok: false,
      response: new Response('Unauthorized', { status: 401 }),
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(h.createSavedPlanMock).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid body', async () => {
    const res = await POST(makeRequest({ name: 'no snapshot' }));
    expect(res.status).toBe(400);
    expect(h.getBlueprintStructureMock).not.toHaveBeenCalled();
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await POST(makeRequest('{not valid json'));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Invalid JSON');
    expect(h.getBlueprintStructureMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the blueprint does not resolve', async () => {
    h.getBlueprintStructureMock.mockResolvedValue(null);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('unknown blueprint');
  });

  it('returns 409 when the caller is at the save cap', async () => {
    h.countSavedPlansMock.mockResolvedValue(MAX_SAVED_PLANS_PER_USER);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
    expect(await res.text()).toBe('template limit reached');
    expect(h.createSavedPlanMock).not.toHaveBeenCalled();
  });

  it('rolls the insert back when a concurrent save breaches the cap', async () => {
    // Pre-check passes, but the post-insert recount sees the race overshoot.
    h.countSavedPlansMock
      .mockResolvedValueOnce(MAX_SAVED_PLANS_PER_USER - 1)
      .mockResolvedValueOnce(MAX_SAVED_PLANS_PER_USER + 1);
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
    expect(await res.text()).toBe('template limit reached');
    expect(h.createSavedPlanMock).toHaveBeenCalledTimes(1);
    const insertedId = h.createSavedPlanMock.mock.calls[0]?.[1]?.id;
    expect(h.deleteSavedPlanMock).toHaveBeenCalledWith('user-1', insertedId);
    expect(h.listSavedPlansMock).not.toHaveBeenCalled();
  });

  it('saves the plan and returns the updated list with 201', async () => {
    h.countSavedPlansMock
      .mockResolvedValueOnce(MAX_SAVED_PLANS_PER_USER - 1)
      .mockResolvedValueOnce(MAX_SAVED_PLANS_PER_USER);
    const res = await POST(makeRequest(VALID_BODY));
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
    expect(h.deleteSavedPlanMock).not.toHaveBeenCalled();
  });

  it('keeps a cross-origin mutation successful when telemetry fails', async () => {
    h.countSavedPlansMock
      .mockResolvedValueOnce(MAX_SAVED_PLANS_PER_USER - 1)
      .mockResolvedValueOnce(MAX_SAVED_PLANS_PER_USER);
    h.logUsageEventMock.mockRejectedValueOnce(new Error('telemetry unavailable'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await POST(makeRequest(VALID_BODY, 'https://foreign.example/private'));

    expect(res.status).toBe(201);
    expect(h.createSavedPlanMock).toHaveBeenCalledTimes(1);
    expect(h.logUsageEventMock).toHaveBeenCalledWith({
      action: 'cross_origin_mutation',
      metadata: {
        route: '/api/account/saved-plans',
        offendingOrigin: 'https://foreign.example',
        source: 'origin',
      },
    });
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());
  });
});

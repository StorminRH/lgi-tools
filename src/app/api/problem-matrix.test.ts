import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  checkAdmin: vi.fn(),
  checkUserId: vi.fn(),
  getSession: vi.fn(),
  getUserById: vi.fn(),
  logUsageEvent: vi.fn(),
  checkRateLimit: vi.fn(),
  fetchWithTimeout: vi.fn(),
  tokenService: vi.fn(),
  accountBelongsToUser: vi.fn(),
  stationManagerGate: vi.fn(),
  getCorpStructures: vi.fn(),
  getCorpStructureRigs: vi.fn(),
  getStructureTypes: vi.fn(),
  getStructureRigs: vi.fn(),
  getBlueprintStructure: vi.fn(),
  countSavedPlans: vi.fn(),
  rejectUnknownSystemPin: vi.fn(),
  countCustomStructures: vi.fn(),
  getPricedSiteDetail: vi.fn(),
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/platform/auth/route-guards', () => ({
  checkAdmin: (...args: unknown[]) => h.checkAdmin(...args),
  checkAdminMutation: (...args: unknown[]) => h.checkAdmin(...args),
  checkUserId: (...args: unknown[]) => h.checkUserId(...args),
}));
vi.mock('@/platform/auth/session', () => ({
  getCurrentUserId: vi.fn(),
  getSession: (...args: unknown[]) => h.getSession(...args),
}));
vi.mock('@/platform/auth/admin-users', () => ({
  getUserById: (...args: unknown[]) => h.getUserById(...args),
  setUserRole: vi.fn(),
}));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => h.logUsageEvent(...args),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (...args: unknown[]) => h.checkRateLimit(...args),
}));
vi.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: (...args: unknown[]) => h.fetchWithTimeout(...args),
}));
vi.mock('@/platform/auth/eve-token-service', () => ({
  getFreshAccessTokenForCharacter: (...args: unknown[]) => h.tokenService(...args),
}));
vi.mock('@/platform/auth/linked-characters', () => ({
  accountBelongsToUser: (...args: unknown[]) => h.accountBelongsToUser(...args),
}));
vi.mock('@/composition/sync/corp-structures-sync', () => ({
  stationManagerGate: (...args: unknown[]) => h.stationManagerGate(...args),
}));
vi.mock('@/features/owned-structures/queries', () => ({
  getCorpStructures: (...args: unknown[]) => h.getCorpStructures(...args),
  getCorpStructureRigs: (...args: unknown[]) => h.getCorpStructureRigs(...args),
  upsertCorpStructureRigs: vi.fn(),
}));
vi.mock('@/data/eve-data/queries', () => ({
  getStructureTypes: (...args: unknown[]) => h.getStructureTypes(...args),
  getStructureRigs: (...args: unknown[]) => h.getStructureRigs(...args),
}));
vi.mock('@/features/industry-planner/queries', () => ({
  getBlueprintStructure: (...args: unknown[]) => h.getBlueprintStructure(...args),
}));
vi.mock('@/features/industry-planner/saved-plans-queries', () => ({
  countSavedPlans: (...args: unknown[]) => h.countSavedPlans(...args),
  createSavedPlan: vi.fn(),
  deleteSavedPlan: vi.fn(),
  listSavedPlans: vi.fn(),
}));
vi.mock('@/features/custom-structures/system-pin', () => ({
  rejectUnknownSystemPin: (...args: unknown[]) => h.rejectUnknownSystemPin(...args),
}));
vi.mock('@/features/custom-structures/queries', () => ({
  countCustomStructures: (...args: unknown[]) => h.countCustomStructures(...args),
  createCustomStructure: vi.fn(),
  listCustomStructures: vi.fn(),
}));
vi.mock('@/features/wormhole-sites/queries', () => ({
  getPricedSiteDetail: (...args: unknown[]) => h.getPricedSiteDetail(...args),
}));

import { NextRequest } from 'next/server';
import { eveTokenEndpoint } from '@/platform/auth/api-contract';
import {
  MAX_CUSTOM_STRUCTURES_PER_USER,
} from '@/features/custom-structures/api-contract';
import {
  MAX_SAVED_PLANS_PER_USER,
} from '@/features/industry-planner/api-contract';
import { dependencyUnavailableFailure } from '@/lib/failure';
import { problemBodySchema } from '@/lib/problem';
import { apiResponse } from '@/transport/api-response';
import { POST as postFeedback } from './feedback/route';
import { POST as postEveToken } from './internal/eve-token/route';
import { POST as postAdminRole } from './admin/role/route';
import { POST as postCorpRigs } from './account/corp-structures/rigs/route';
import { POST as postSavedPlan } from './account/saved-plans/route';
import { POST as postCustomStructure } from './account/custom-structures/route';
import { GET as getSiteDetail } from './sites/[id]/route';

const SECRET = 'matrix-service-secret';
const ADMIN_SESSION = {
  user: { id: 'admin-user' },
  session: {},
  characterId: 90000001,
  name: 'Admin',
  portraitUrl: '',
  role: 'ADMIN' as const,
  isAdmin: true,
};
const EVE_BODY = { userId: 'user-1', characterId: 90000002 };
const SAVED_PLAN_BODY = {
  name: 'Hulk batch',
  snapshot: { v: 1, blueprintTypeId: 22548 },
};
const CUSTOM_STRUCTURE_BODY = {
  name: 'Home Azbel',
  structureTypeId: 35826,
  rigTypeIds: [37170],
  systemId: 30000142,
  taxPct: 1,
};
const CORP_RIGS_BODY = {
  corporationId: 2001,
  structureId: 1001,
  rigTypeIds: [37170],
  taxPct: 1.5,
};

function jsonRequest(path: string, body: unknown, authorization?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authorization ? { Authorization: authorization } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function formRequest(path: string, fields: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
}

async function expectProblem(
  response: Response,
  status: number,
  code: string,
): Promise<string> {
  const text = await response.text();
  expect(response.status).toBe(status);
  expect(response.headers.get('Content-Type')).toBe('application/problem+json');
  expect(problemBodySchema.parse(JSON.parse(text))).toMatchObject({ status, code });
  return text;
}

beforeEach(() => {
  vi.stubEnv('CONVEX_SERVICE_SECRET', SECRET);
  vi.stubEnv('LINEAR_API_KEY', 'lin_api_test_token');
  h.checkAdmin.mockReset().mockResolvedValue({ ok: true, session: ADMIN_SESSION });
  h.checkUserId.mockReset().mockResolvedValue({ ok: true, userId: 'user-1' });
  h.getSession.mockReset().mockResolvedValue(null);
  h.getUserById.mockReset().mockResolvedValue(null);
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
  h.checkRateLimit.mockReset().mockResolvedValue({ ok: true });
  h.fetchWithTimeout.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  h.tokenService.mockReset().mockResolvedValue({ kind: 'ok', accessToken: 'token', expiresAt: 1 });
  h.accountBelongsToUser.mockReset().mockResolvedValue(true);
  h.stationManagerGate.mockReset().mockResolvedValue({ ok: true });
  h.getCorpStructures.mockReset().mockResolvedValue(new Map());
  h.getCorpStructureRigs.mockReset().mockResolvedValue(new Map());
  h.getStructureTypes.mockReset().mockResolvedValue([
    { typeId: 35826, name: 'Azbel', groupId: 1404, rigSize: 3 },
  ]);
  h.getStructureRigs.mockReset().mockResolvedValue([
    {
      typeId: 37170,
      name: 'L-Set Equipment Mfg Eff I',
      canFitGroups: [1657, 1404, 1406],
      rigSize: 3,
    },
  ]);
  h.getBlueprintStructure.mockReset().mockResolvedValue({
    product: { typeId: 22544, name: 'Hulk' },
  });
  h.countSavedPlans.mockReset().mockResolvedValue(0);
  h.rejectUnknownSystemPin.mockReset().mockResolvedValue({ ok: true });
  h.countCustomStructures.mockReset().mockResolvedValue(0);
  h.getPricedSiteDetail.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('route-level problem status matrix', () => {
  it('covers 400 parse and domain failures', async () => {
    await expectProblem(
      await postFeedback(jsonRequest('/api/feedback', '{not json')),
      400,
      'invalid_json',
    );
    await expectProblem(
      await postFeedback(
        jsonRequest('/api/feedback', {
          title: 'hello',
          message: 'hello',
          path: 'not-a-path',
          category: 'bug',
        }),
      ),
      400,
      'path_invalid',
    );
  });

  it('covers 401 guard and internal-service failures', async () => {
    h.checkUserId.mockResolvedValue({
      ok: false,
      failure: { category: 'unauthenticated', code: 'unauthenticated' },
    });
    await expectProblem(
      await postSavedPlan(jsonRequest('/api/account/saved-plans', SAVED_PLAN_BODY)),
      401,
      'unauthenticated',
    );
    await expectProblem(
      await postEveToken(jsonRequest('/api/internal/eve-token', EVE_BODY)),
      401,
      'unauthenticated',
    );
  });

  it('covers 403 admin and station-manager failures', async () => {
    h.checkAdmin.mockResolvedValue({
      ok: false,
      failure: { category: 'forbidden', code: 'forbidden' },
    });
    await expectProblem(
      await postAdminRole(
        formRequest('/api/admin/role', { userId: 'target-user', nextRole: 'ADMIN' }),
      ),
      403,
      'forbidden',
    );

    h.stationManagerGate.mockResolvedValue({
      ok: false,
      failure: {
        category: 'forbidden',
        code: 'not_station_manager',
        detail: 'Requires the Station Manager role',
      },
    });
    await expectProblem(
      await postCorpRigs(
        jsonRequest('/api/account/corp-structures/rigs', CORP_RIGS_BODY),
      ),
      403,
      'not_station_manager',
    );
  });

  it('covers 404 internal-service, sites, and form failures', async () => {
    h.accountBelongsToUser.mockResolvedValue(false);
    await expectProblem(
      await postEveToken(
        jsonRequest('/api/internal/eve-token', EVE_BODY, `Bearer ${SECRET}`),
      ),
      404,
      'not_found',
    );
    await expectProblem(
      await getSiteDetail(new Request('http://localhost:3000/api/sites/999'), {
        params: Promise.resolve({ id: '999' }),
      }),
      404,
      'not_found',
    );
    await expectProblem(
      await postAdminRole(
        formRequest('/api/admin/role', { userId: 'missing-user', nextRole: 'ADMIN' }),
      ),
      404,
      'user_not_found',
    );
  });

  it('covers 409 service, template, and structure conflicts', async () => {
    h.tokenService.mockResolvedValue({ kind: 'reauth_required' });
    await expectProblem(
      await postEveToken(
        jsonRequest('/api/internal/eve-token', EVE_BODY, `Bearer ${SECRET}`),
      ),
      409,
      'reauth_required',
    );
    h.countSavedPlans.mockResolvedValue(MAX_SAVED_PLANS_PER_USER);
    await expectProblem(
      await postSavedPlan(jsonRequest('/api/account/saved-plans', SAVED_PLAN_BODY)),
      409,
      'template_limit',
    );
    h.countCustomStructures.mockResolvedValue(MAX_CUSTOM_STRUCTURES_PER_USER);
    await expectProblem(
      await postCustomStructure(
        jsonRequest('/api/account/custom-structures', CUSTOM_STRUCTURE_BODY),
      ),
      409,
      'structure_limit',
    );
  });

  it('covers a 429 rate-limited route', async () => {
    h.checkRateLimit.mockResolvedValue({
      ok: false,
      failure: {
        category: 'rate_limited',
        code: 'rate_limited',
        retryAfterSeconds: 11,
      },
    });
    const response = await postFeedback(
      jsonRequest('/api/feedback', {
        title: 'hello',
        message: 'hello',
        path: '/sites',
        category: 'bug',
      }),
    );
    await expectProblem(response, 429, 'rate_limited');
    expect(response.headers.get('Retry-After')).toBe('11');
  });

  it('covers 502 service and feedback dependencies', async () => {
    h.tokenService.mockResolvedValue({ kind: 'upstream_error' });
    await expectProblem(
      await postEveToken(
        jsonRequest('/api/internal/eve-token', EVE_BODY, `Bearer ${SECRET}`),
      ),
      502,
      'upstream_error',
    );
    h.fetchWithTimeout.mockResolvedValue(new Response('denied', { status: 429 }));
    await expectProblem(
      await postFeedback(
        jsonRequest('/api/feedback', {
          title: 'hello',
          message: 'hello',
          path: '/sites',
          category: 'bug',
        }),
      ),
      502,
      'linear_failed',
    );
  });

  it('covers a 503 feedback dependency', async () => {
    vi.stubEnv('LINEAR_API_KEY', '');
    await expectProblem(
      await postFeedback(
        jsonRequest('/api/feedback', {
          title: 'hello',
          message: 'hello',
          path: '/sites',
          category: 'bug',
        }),
      ),
      503,
      'feedback_unconfigured',
    );
  });

  it('never serializes a seeded internal cause', async () => {
    const seededSecret = 'seeded-private-cause';
    const response = apiResponse(
      eveTokenEndpoint,
      502,
      dependencyUnavailableFailure('upstream_error', 502, {
        cause: new Error(seededSecret),
        detail: 'Safe dependency failure',
      }),
    );
    const text = await expectProblem(response, 502, 'upstream_error');
    expect(text).not.toContain(seededSecret);
    expect(text).toContain('Safe dependency failure');
  });

  it('never leaks a rejected feedback Linear cause through the real route', async () => {
    const seededSecret = 'seeded-feedback-linear-secret';
    h.fetchWithTimeout.mockRejectedValueOnce(new Error(seededSecret));

    const response = await postFeedback(
      jsonRequest('/api/feedback', {
        title: 'hello',
        message: 'hello',
        path: '/sites',
        category: 'bug',
      }),
    );
    const text = await expectProblem(response, 502, 'linear_failed');

    expect(text).not.toContain(seededSecret);
    expect(text).toContain('Could not reach Linear');
  });
});

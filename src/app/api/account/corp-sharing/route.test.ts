import { beforeEach, expect, test, vi } from 'vitest';
import { sessionFixture } from '@/composition/__tests__/session-fixture';
import type { SessionCheckResult } from '@/composition/route-guards';

const h = vi.hoisted(() => ({
  checkSession: vi.fn<() => Promise<SessionCheckResult>>(),
  getUserAffiliations: vi.fn(),
  probeAndStoreRoles: vi.fn(),
  switches: new Map<number, { enabled: boolean; setBy: number | null }>(),
}));

vi.mock('@/composition/route-guards', () => ({
  checkSession: () => h.checkSession(),
}));
vi.mock('@/composition/map-affiliation-access', () => ({ reconcileAffiliationAccess: vi.fn() }));
vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliationsWithOutcome: async () => ({ refreshed: 0, accessChanged: false, transientFailure: false }),
}));
vi.mock('@/platform/auth/affiliation-store', () => ({
  getUserAffiliations: (...args: unknown[]) => h.getUserAffiliations(...args),
  recordCorpAccessDecision: vi.fn(),
}));
vi.mock('@/composition/sync/owner-sync-port', () => ({
  vendTokenFor: async () => 'token',
  probeAndStoreRoles: (...args: unknown[]) => h.probeAndStoreRoles(...args),
}));
vi.mock('@/platform/auth/corp-sharing-store', () => ({
  setCorpSharing: async (corporationId: number, enabled: boolean, setBy: number | null) => {
    h.switches.set(corporationId, { enabled, setBy });
  },
}));

import { postJson } from '@/lib/__tests__/route-requests';
import { problemBodySchema } from '@/lib/problem';
import { POST } from './route';

const CORP = 98000001;
// The account's active character, which records the switch; the Director pilot is 90001.
const ACTIVE_CHARACTER = 90002;

const ROUTE = '/api/account/corp-sharing';

function pilotIn(corporationId: number) {
  return [{
    characterId: 90001, sharedAccessEligible: true, corporationId, allianceId: null, factionId: null,
    refreshedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000),
  }];
}

beforeEach(() => {
  h.checkSession.mockReset().mockResolvedValue({
    ok: true,
    session: sessionFixture({ user: { id: 'user-1' }, characterId: ACTIVE_CHARACTER }),
  });
  h.getUserAffiliations.mockReset().mockResolvedValue(pilotIn(CORP));
  h.probeAndStoreRoles.mockReset().mockResolvedValue(['Director']);
  h.switches.clear();
});

test('refuses a pilot outside the corporation and a member who is not a Director', async () => {
  h.getUserAffiliations.mockResolvedValueOnce(pilotIn(98000002));
  const outsider = await POST(postJson(ROUTE, { corporationId: CORP, enabled: true }));
  expect(outsider.status).toBe(403);
  expect(problemBodySchema.parse(await outsider.json())).toMatchObject({ code: 'not_corp_member' });

  h.probeAndStoreRoles.mockResolvedValue(['Station_Manager', 'Factory_Manager']);
  const member = await POST(postJson(ROUTE, { corporationId: CORP, enabled: true }));
  expect(member.status).toBe(403);
  expect(problemBodySchema.parse(await member.json())).toMatchObject({
    code: 'not_director',
    detail: 'Requires the Director role',
  });
  expect(h.switches.size).toBe(0);
});

test('lets a Director turn sharing on', async () => {
  const res = await POST(postJson(ROUTE, { corporationId: CORP, enabled: true }));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ corporationId: CORP, enabled: true });
  expect(h.getUserAffiliations).toHaveBeenCalledWith('user-1');
  expect(h.switches.get(CORP)).toEqual({ enabled: true, setBy: ACTIVE_CHARACTER });
});

test('lands on the same value when the same request repeats', async () => {
  const first = await POST(postJson(ROUTE, { corporationId: CORP, enabled: false }));
  const second = await POST(postJson(ROUTE, { corporationId: CORP, enabled: false }));
  expect([first.status, second.status]).toEqual([200, 200]);
  expect(await second.json()).toEqual({ corporationId: CORP, enabled: false });
  expect([...h.switches]).toEqual([[CORP, { enabled: false, setBy: ACTIVE_CHARACTER }]]);
});

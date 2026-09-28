import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { CachedAffiliation } from '@/platform/auth/affiliation-store';

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  reconcile: vi.fn(),
  fetchAffiliations: vi.fn(),
  updateAffiliations: vi.fn(),
  captureAffiliationObservedAt: vi.fn(),
  getUserAffiliations: vi.fn(),
  recordCorpAccessDecision: vi.fn(),
}));
vi.mock('@/platform/auth/affiliation-source', () => ({ fetchAffiliations: mocks.fetchAffiliations }));
vi.mock('@/platform/auth/affiliation-store', () => ({
  getUserAffiliations: mocks.getUserAffiliations,
  updateAffiliations: mocks.updateAffiliations,
  captureAffiliationObservedAt: mocks.captureAffiliationObservedAt,
  recordCorpAccessDecision: mocks.recordCorpAccessDecision,
}));
vi.mock('next/server', () => ({ after: mocks.after }));
vi.mock('@/composition/map-affiliation-access', () => ({ reconcileAffiliationAccess: mocks.reconcile }));

import { authorizeCorpMutation } from '@/platform/auth/corp-access';
import { resolveUserCorpAccess } from '@/composition/corp-access';

const NOW = new Date('2026-09-15T12:00:00Z');
const STALE = new Date(NOW.getTime() - freshnessGate('affiliations').ttlMs - 1);
function row(characterId: number, corporationId: number | null, refreshedAt: Date | null = NOW): CachedAffiliation {
  return { characterId, corporationId, allianceId: null, factionId: null, refreshedAt };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.resetAllMocks();
  mocks.fetchAffiliations.mockResolvedValue({ rows: [], transientFailure: false });
  mocks.updateAffiliations.mockResolvedValue({ refreshed: 0, accessChanged: false });
  mocks.captureAffiliationObservedAt.mockResolvedValue('2026-09-15 12:00:00.000001');
  mocks.getUserAffiliations.mockResolvedValue([]);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('reads once without refresh writes, rereads after a stale refresh, and reevaluates freshness after a partial failure', async () => {
  mocks.getUserAffiliations.mockResolvedValue([row(101, 2000), row(102, 2000), row(103, null)]);
  const fresh = await resolveUserCorpAccess('u1');
  expect(fresh.corporationIds).toEqual([2000]);
  expect(mocks.getUserAffiliations).toHaveBeenCalledOnce();
  expect(mocks.fetchAffiliations).not.toHaveBeenCalled();
  expect(mocks.updateAffiliations).not.toHaveBeenCalled();
  expect(mocks.recordCorpAccessDecision).not.toHaveBeenCalled();
  expect(mocks.after).not.toHaveBeenCalled();

  mocks.getUserAffiliations
    .mockResolvedValueOnce([row(101, 2000, STALE), row(102, 2000, null), row(103, 4000)])
    .mockResolvedValueOnce([row(101, 3000), row(102, null, null)]);
  const fetched = [row(101, 3000), row(102, 3000), row(999, 5000)];
  mocks.fetchAffiliations.mockResolvedValue({ rows: fetched, transientFailure: false });
  mocks.updateAffiliations.mockResolvedValueOnce({ refreshed: 2, accessChanged: true });
  const refreshed = await resolveUserCorpAccess('u1');
  expect(mocks.fetchAffiliations).toHaveBeenCalledWith([101, 102]);
  expect(mocks.getUserAffiliations).toHaveBeenCalledTimes(3);
  expect(refreshed.allCharacterIds).toEqual([101, 102]);
  expect(refreshed.corporationIds).toEqual([3000]);
  expect(refreshed.characterIdsByCorporation[3000]).toEqual([101]);
  expect(mocks.after).toHaveBeenCalledWith(mocks.reconcile);

  mocks.getUserAffiliations.mockResolvedValue([
    row(101, 2000, STALE), row(102, 3000),
    row(103, 4000, new Date(NOW.getTime() - freshnessGate('affiliations').ttlMs + 500)),
  ]);
  mocks.fetchAffiliations.mockImplementation(async () => {
    vi.setSystemTime(NOW.getTime() + 1000);
    return { rows: [], transientFailure: true };
  });
  const partial = await resolveUserCorpAccess('u1');
  expect(partial.allCharacterIds).toEqual([101, 102, 103]);
  expect(partial.corporationIds).toEqual([3000]);
  expect(partial.refreshTransientFailure).toBe(true);
  expect(partial.resolvedAt).toBe(NOW.getTime() + 1000);
});

test('audits explicit allow and deny decisions, and propagates audit failure', async () => {
  mocks.getUserAffiliations.mockResolvedValue([row(101, 2000)]);
  const access = await resolveUserCorpAccess('u1');
  await expect(authorizeCorpMutation(access, 2000)).resolves.toEqual({ allowed: true, reason: 'member', characterId: 101 });
  await expect(authorizeCorpMutation(access, 3000)).resolves.toEqual({ allowed: false, reason: 'not_member', characterId: null });
  expect(mocks.recordCorpAccessDecision).toHaveBeenLastCalledWith({ userId: 'u1', corporationId: 3000, allowed: false, reason: 'not_member', characterId: null });
  const failure = new Error('audit unavailable');
  mocks.recordCorpAccessDecision.mockRejectedValue(failure);
  await expect(authorizeCorpMutation(access, 2000)).rejects.toBe(failure);
});

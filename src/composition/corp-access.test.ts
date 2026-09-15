import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('corporation access snapshot', () => {
  it('reads once, groups member pilots, and performs no refresh writes or audit for pure reads', async () => {
    mocks.getUserAffiliations.mockResolvedValue([row(101, 2000), row(102, 2000), row(103, null)]);
    const access = await resolveUserCorpAccess('u1');
    expect(access.allCharacterIds).toEqual([101, 102, 103]);
    expect(access.corporationIds).toEqual([2000]);
    expect(access.characterIdsByCorporation[2000]).toEqual([101, 102]);
    expect(access.characterIdsByCorporation[3000]).toBeUndefined();
    expect(mocks.getUserAffiliations).toHaveBeenCalledOnce();
    expect(mocks.fetchAffiliations).not.toHaveBeenCalled();
    expect(mocks.updateAffiliations).not.toHaveBeenCalled();
    expect(mocks.recordCorpAccessDecision).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(Object.isFrozen(access)).toBe(true);
    expect(Object.isFrozen(access.characterIdsByCorporation)).toBe(true);
    expect(Object.isFrozen(access.characterIdsByCorporation[2000])).toBe(true);
  });

  it('rereads persisted membership and current links after refreshing stale affiliations', async () => {
    mocks.getUserAffiliations
      .mockResolvedValueOnce([row(101, 2000, STALE), row(102, 2000, null), row(103, 4000)])
      .mockResolvedValueOnce([row(101, 3000), row(102, null, null)]);
    const fetched = [row(101, 3000), row(102, 3000), row(999, 5000)];
    mocks.fetchAffiliations.mockResolvedValue({ rows: fetched, transientFailure: false });
    mocks.updateAffiliations.mockResolvedValue({ refreshed: 2, accessChanged: true });
    const access = await resolveUserCorpAccess('u1');
    expect(mocks.fetchAffiliations).toHaveBeenCalledWith([101, 102]);
    expect(mocks.getUserAffiliations).toHaveBeenCalledTimes(2);
    expect(access.allCharacterIds).toEqual([101, 102]);
    expect(access.corporationIds).toEqual([3000]);
    expect(access.characterIdsByCorporation[3000]).toEqual([101]);
    expect(mocks.after).toHaveBeenCalledWith(mocks.reconcile);
  });

  it('keeps still-fresh membership on partial failure and evaluates freshness after the refresh wait', async () => {
    mocks.getUserAffiliations.mockResolvedValue([
      row(101, 2000, STALE), row(102, 3000),
      row(103, 4000, new Date(NOW.getTime() - freshnessGate('affiliations').ttlMs + 500)),
    ]);
    mocks.fetchAffiliations.mockImplementation(async () => {
      vi.setSystemTime(NOW.getTime() + 1000);
      return { rows: [], transientFailure: true };
    });
    const access = await resolveUserCorpAccess('u1');
    expect(access.allCharacterIds).toEqual([101, 102, 103]);
    expect(access.corporationIds).toEqual([3000]);
    expect(access.refreshTransientFailure).toBe(true);
    expect(access.resolvedAt).toBe(NOW.getTime() + 1000);
  });

  it('audits explicit allow and deny decisions, and propagates audit failure', async () => {
    mocks.getUserAffiliations.mockResolvedValue([row(101, 2000)]);
    const access = await resolveUserCorpAccess('u1');
    await expect(authorizeCorpMutation(access, 2000)).resolves.toEqual({ allowed: true, reason: 'member', characterId: 101 });
    await expect(authorizeCorpMutation(access, 3000)).resolves.toEqual({ allowed: false, reason: 'not_member', characterId: null });
    expect(mocks.recordCorpAccessDecision).toHaveBeenLastCalledWith({ userId: 'u1', corporationId: 3000, allowed: false, reason: 'not_member', characterId: null });
    const failure = new Error('audit unavailable');
    mocks.recordCorpAccessDecision.mockRejectedValue(failure);
    await expect(authorizeCorpMutation(access, 2000)).rejects.toBe(failure);
  });
});

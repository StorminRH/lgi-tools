import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { CachedAffiliation } from './membership';

const fetchAffiliationsMock = vi.fn();
const updateAffiliationsMock = vi.fn();
const getUserAffiliationsMock = vi.fn();
const recordCorpAccessDecisionMock = vi.fn();

vi.mock('./affiliation-source', () => ({
  fetchAffiliations: (...args: unknown[]) => fetchAffiliationsMock(...args),
}));
vi.mock('./affiliation-store', () => ({
  getUserAffiliations: (...args: unknown[]) => getUserAffiliationsMock(...args),
  updateAffiliations: (...args: unknown[]) => updateAffiliationsMock(...args),
  recordCorpAccessDecision: (...args: unknown[]) => recordCorpAccessDecisionMock(...args),
}));

import { loadUserCorpAccess } from './user-corp-access';

const AFFILIATION_WINDOW_MS = freshnessGate('affiliations').ttlMs;
const FRESH = new Date(Date.now() - 1_000);
const STALE = new Date(Date.now() - AFFILIATION_WINDOW_MS - 1_000);

function rowFor(characterId: number, corporationId: number, refreshedAt: Date | null): CachedAffiliation {
  return { characterId, corporationId, allianceId: null, factionId: null, refreshedAt };
}

beforeEach(() => {
  fetchAffiliationsMock.mockReset().mockResolvedValue({ rows: [], transientFailure: false });
  updateAffiliationsMock.mockReset().mockResolvedValue(undefined);
  getUserAffiliationsMock.mockReset();
  recordCorpAccessDecisionMock.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('loadUserCorpAccess', () => {
  it('allows a member and records the granting character on decide', async () => {
    getUserAffiliationsMock.mockResolvedValue([rowFor(101, 2000, FRESH)]);

    const access = await loadUserCorpAccess('u1');
    expect(access.characterIds).toEqual([101]);
    expect(access.corporationIds).toEqual([2000]);
    expect(access.has(2000)).toBe(true);
    expect(access.characterIdsIn(2000)).toEqual([101]);

    const decision = await access.decide(2000);

    expect(decision).toEqual({ allowed: true, reason: 'member', characterId: 101 });
    expect(recordCorpAccessDecisionMock).toHaveBeenCalledTimes(1);
    expect(recordCorpAccessDecisionMock).toHaveBeenCalledWith({
      userId: 'u1',
      corporationId: 2000,
      characterId: 101,
      allowed: true,
      reason: 'member',
    });
  });

  it('denies a non-member and records the deny without a granting character', async () => {
    getUserAffiliationsMock.mockResolvedValue([rowFor(101, 2000, FRESH)]);

    const access = await loadUserCorpAccess('u1');
    expect(access.has(3000)).toBe(false);
    expect(access.characterIdsIn(3000)).toEqual([]);

    const decision = await access.decide(3000);

    expect(decision).toEqual({ allowed: false, reason: 'not_member', characterId: null });
    expect(recordCorpAccessDecisionMock).toHaveBeenCalledWith({
      userId: 'u1',
      corporationId: 3000,
      characterId: null,
      allowed: false,
      reason: 'not_member',
    });
  });

  it('refreshes a stale affiliation before freezing, then allows on the fresh re-read', async () => {
    getUserAffiliationsMock
      .mockResolvedValueOnce([rowFor(101, 2000, STALE)])
      .mockResolvedValueOnce([rowFor(101, 2000, FRESH)]);
    fetchAffiliationsMock.mockResolvedValue({
      rows: [{ characterId: 101, corporationId: 2000, allianceId: null, factionId: null }],
      transientFailure: false,
    });

    const access = await loadUserCorpAccess('u1');
    const decision = await access.decide(2000);

    expect(fetchAffiliationsMock).toHaveBeenCalledWith([101]);
    expect(access.has(2000)).toBe(true);
    expect(decision).toEqual({ allowed: true, reason: 'member', characterId: 101 });
  });

  it('fails closed when a refresh cannot reach ESI', async () => {
    getUserAffiliationsMock.mockResolvedValue([rowFor(101, 2000, null)]);
    fetchAffiliationsMock.mockRejectedValue(new Error('ESI unreachable'));

    const access = await loadUserCorpAccess('u1');
    const decision = await access.decide(2000);

    expect(fetchAffiliationsMock).toHaveBeenCalledWith([101]);
    expect(access.characterIds).toEqual([101]);
    expect(access.corporationIds).toEqual([]);
    expect(access.refreshTransientFailure).toBe(true);
    expect(decision).toEqual({ allowed: false, reason: 'not_member', characterId: null });
    expect(recordCorpAccessDecisionMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', corporationId: 2000, allowed: false }),
    );
  });

  it('keeps character identity when the corporation row is stale and does not write audit on list', async () => {
    getUserAffiliationsMock.mockResolvedValue([rowFor(42, 99, STALE)]);

    const access = await loadUserCorpAccess('user-1');

    expect(access.characterIds).toEqual([42]);
    expect(access.corporationIds).toEqual([]);
    expect(recordCorpAccessDecisionMock).not.toHaveBeenCalled();
  });
});

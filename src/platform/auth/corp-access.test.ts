import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { CachedAffiliation } from './affiliation-store';

const refreshAffiliationsWithRowsMock = vi.fn();
const getUserAffiliationsMock = vi.fn();
const recordCorpAccessDecisionMock = vi.fn();

vi.mock('./affiliation', () => ({
  refreshAffiliationsWithRows: (...args: unknown[]) => refreshAffiliationsWithRowsMock(...args),
}));
vi.mock('./affiliation-store', () => ({
  getUserAffiliations: (...args: unknown[]) => getUserAffiliationsMock(...args),
  recordCorpAccessDecision: (...args: unknown[]) => recordCorpAccessDecisionMock(...args),
}));

import {
  authorizeCorpMutation,
  decideCorpMembership,
  isCorpMember,
  memberCharacterIdForCorp,
  memberCharacterIdsForCorp,
  resolveUserCorpAccess,
  type UserCorpAccess,
} from './corp-access';

const AFFILIATION_WINDOW_MS = freshnessGate('affiliations').ttlMs;
const FRESH = new Date(Date.now() - 1_000);
const STALE = new Date(Date.now() - AFFILIATION_WINDOW_MS - 1_000);

function rowFor(
  characterId: number,
  corporationId: number | null,
  refreshedAt: Date | null,
): CachedAffiliation {
  return { characterId, corporationId, allianceId: null, factionId: null, refreshedAt };
}

function accessFor(overrides: Partial<UserCorpAccess> = {}): UserCorpAccess {
  return {
    userId: 'u1',
    resolvedAt: new Date(),
    transientFailure: false,
    memberCorpIds: [],
    memberCharacterIdsByCorp: new Map(),
    allCharacterIds: [],
    ...overrides,
  };
}

beforeEach(() => {
  refreshAffiliationsWithRowsMock.mockReset().mockResolvedValue({ rows: [], transientFailure: false });
  getUserAffiliationsMock.mockReset().mockResolvedValue([]);
  recordCorpAccessDecisionMock.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('resolveUserCorpAccess', () => {
  it('resolves a frozen snapshot from one read without refreshing fresh rows', async () => {
    getUserAffiliationsMock.mockResolvedValue([rowFor(101, 2000, FRESH), rowFor(102, 3000, FRESH)]);

    const access = await resolveUserCorpAccess('u1');

    expect(access.userId).toBe('u1');
    expect(access.resolvedAt).toBeInstanceOf(Date);
    expect(access.transientFailure).toBe(false);
    expect(access.allCharacterIds).toEqual([101, 102]);
    expect(access.memberCorpIds).toEqual([2000, 3000]);
    expect(access.memberCharacterIdsByCorp.get(2000)).toEqual([101]);
    expect(refreshAffiliationsWithRowsMock).toHaveBeenCalledWith([]);
    expect(getUserAffiliationsMock).toHaveBeenCalledTimes(1);
    expect(recordCorpAccessDecisionMock).not.toHaveBeenCalled();
    expect(Object.isFrozen(access)).toBe(true);
    expect(Object.isFrozen(access.memberCorpIds)).toBe(true);
    expect(Object.isFrozen(access.allCharacterIds)).toBe(true);
  });

  it('refreshes only stale ids and merges confirmed rows in memory with no re-read', async () => {
    getUserAffiliationsMock.mockResolvedValue([
      rowFor(101, 2000, FRESH),
      rowFor(102, 2000, STALE),
      rowFor(103, 4000, null),
    ]);
    refreshAffiliationsWithRowsMock.mockResolvedValue({
      rows: [
        { characterId: 102, corporationId: 3000, allianceId: null, factionId: null },
        { characterId: 103, corporationId: 4000, allianceId: null, factionId: null },
      ],
      transientFailure: false,
    });

    const access = await resolveUserCorpAccess('u1');

    expect(refreshAffiliationsWithRowsMock).toHaveBeenCalledWith([102, 103]);
    expect(getUserAffiliationsMock).toHaveBeenCalledTimes(1);
    expect(access.allCharacterIds).toEqual([101, 102, 103]);
    expect(access.memberCorpIds).toEqual([2000, 3000, 4000]);
    expect(access.memberCharacterIdsByCorp.get(3000)).toEqual([102]);
  });

  it('fails closed on stale rows ESI never confirmed: identity stays, corp sets shrink', async () => {
    getUserAffiliationsMock.mockResolvedValue([
      rowFor(101, 2000, FRESH),
      rowFor(102, 3000, STALE),
      rowFor(103, null, FRESH),
    ]);
    refreshAffiliationsWithRowsMock.mockResolvedValue({ rows: [], transientFailure: false });

    const access = await resolveUserCorpAccess('u1');

    expect(refreshAffiliationsWithRowsMock).toHaveBeenCalledWith([102]);
    expect(access.allCharacterIds).toEqual([101, 102, 103]);
    expect(access.memberCorpIds).toEqual([2000]);
    expect(access.memberCharacterIdsByCorp.has(3000)).toBe(false);
    expect(access.transientFailure).toBe(false);
  });

  it('never throws on ESI failure: transientFailure is set and corp sets shrink', async () => {
    getUserAffiliationsMock.mockResolvedValue([
      rowFor(101, 2000, FRESH),
      rowFor(102, 3000, STALE),
    ]);
    refreshAffiliationsWithRowsMock.mockResolvedValue({ rows: [], transientFailure: true });

    const access = await resolveUserCorpAccess('u1');

    expect(access.transientFailure).toBe(true);
    expect(access.allCharacterIds).toEqual([101, 102]);
    expect(access.memberCorpIds).toEqual([2000]);
    expect(recordCorpAccessDecisionMock).not.toHaveBeenCalled();
  });
});

describe('selectors', () => {
  it('fails closed on stale, never-refreshed, empty, and null corp', async () => {
    getUserAffiliationsMock.mockResolvedValue([
      rowFor(101, 2000, STALE),
      rowFor(102, 2000, null),
      rowFor(103, null, FRESH),
    ]);

    const access = await resolveUserCorpAccess('u1');

    expect(isCorpMember(access, 2000)).toBe(false);
    expect(memberCharacterIdForCorp(access, 2000)).toBeNull();
    expect(memberCharacterIdsForCorp(access, 2000)).toEqual([]);
    expect(decideCorpMembership(access, 2000)).toEqual({
      allowed: false,
      reason: 'not_member',
      characterId: null,
    });

    const empty = await resolveUserCorpAccess('nobody');
    expect(isCorpMember(empty, 2000)).toBe(false);
    expect(memberCharacterIdsForCorp(empty, 2000)).toEqual([]);
  });

  it('allows any fresh linked member and revokes after a corp change', () => {
    const access = accessFor({
      memberCorpIds: [2000],
      memberCharacterIdsByCorp: new Map([[2000, [102]]]),
      allCharacterIds: [101, 102],
    });

    expect(isCorpMember(access, 2000)).toBe(true);
    expect(isCorpMember(access, 3000)).toBe(false);
    expect(decideCorpMembership(access, 2000)).toEqual({
      allowed: true,
      reason: 'member',
      characterId: 102,
    });
  });

  it('returns the first fresh matching pilot for the audit', () => {
    const access = accessFor({
      memberCorpIds: [2000],
      memberCharacterIdsByCorp: new Map([[2000, [102, 104]]]),
      allCharacterIds: [101, 102, 104],
    });

    expect(memberCharacterIdForCorp(access, 2000)).toBe(102);
    expect(memberCharacterIdForCorp(access, 3000)).toBeNull();
  });

  it('collects distinct fresh members per corp', () => {
    const access = accessFor({
      memberCorpIds: [2000, 3000],
      memberCharacterIdsByCorp: new Map([
        [2000, [101, 102]],
        [3000, [103]],
      ]),
      allCharacterIds: [101, 102, 103, 104],
    });

    expect(memberCharacterIdsForCorp(access, 2000)).toEqual([101, 102]);
    expect(memberCharacterIdsForCorp(access, 3000)).toEqual([103]);
    expect(memberCharacterIdsForCorp(access, 4000)).toEqual([]);
  });
});

describe('authorizeCorpMutation', () => {
  it('allows a member and records the granting character exactly once', async () => {
    const access = accessFor({
      memberCorpIds: [2000],
      memberCharacterIdsByCorp: new Map([[2000, [101]]]),
      allCharacterIds: [101],
    });

    const decision = await authorizeCorpMutation(access, 2000);

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

  it('denies a non-member and records the deny with no granting character', async () => {
    const access = accessFor({
      memberCorpIds: [2000],
      memberCharacterIdsByCorp: new Map([[2000, [101]]]),
      allCharacterIds: [101],
    });

    const decision = await authorizeCorpMutation(access, 3000);

    expect(decision).toEqual({ allowed: false, reason: 'not_member', characterId: null });
    expect(recordCorpAccessDecisionMock).toHaveBeenCalledWith({
      userId: 'u1',
      corporationId: 3000,
      characterId: null,
      allowed: false,
      reason: 'not_member',
    });
  });

  it('propagates an audit throw so the caller denies', async () => {
    const access = accessFor({
      memberCorpIds: [2000],
      memberCharacterIdsByCorp: new Map([[2000, [101]]]),
      allCharacterIds: [101],
    });
    recordCorpAccessDecisionMock.mockRejectedValue(new Error('audit unavailable'));

    await expect(authorizeCorpMutation(access, 2000)).rejects.toThrow('audit unavailable');
  });
});

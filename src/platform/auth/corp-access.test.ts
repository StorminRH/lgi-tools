import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { CachedAffiliation } from './membership';

// Only the ESI source and the Neon readers/writer are mocked, so the real
// refresh-then-decide composition (refreshStaleAffiliationsForUser → refresh →
// memberCharacterIdInCorp) and its fail-closed behaviour run end to end. The audit
// writer is spied to prove a row is recorded on BOTH allow and deny.
const fetchAffiliationsMock = vi.fn();
const upsertAffiliationsMock = vi.fn();
const getUserAffiliationsMock = vi.fn();
const recordCorpAccessDecisionMock = vi.fn();

vi.mock('./affiliation-source', () => ({
  fetchAffiliations: (...args: unknown[]) => fetchAffiliationsMock(...args),
}));
vi.mock('./affiliation-store', () => ({
  getUserAffiliations: (...args: unknown[]) => getUserAffiliationsMock(...args),
  upsertAffiliations: (...args: unknown[]) => upsertAffiliationsMock(...args),
  getCharacterAffiliation: vi.fn(),
  recordCorpAccessDecision: (...args: unknown[]) => recordCorpAccessDecisionMock(...args),
}));

import { decideCorpAccess } from './corp-access';

const AFFILIATION_WINDOW_MS = freshnessGate('affiliations').ttlMs;
const FRESH = new Date(Date.now() - 1_000);
const STALE = new Date(Date.now() - AFFILIATION_WINDOW_MS - 1_000);

function rowFor(characterId: number, corporationId: number, refreshedAt: Date | null): CachedAffiliation {
  return { characterId, corporationId, allianceId: null, factionId: null, refreshedAt };
}

beforeEach(() => {
  fetchAffiliationsMock.mockReset().mockResolvedValue([]);
  upsertAffiliationsMock.mockReset().mockResolvedValue(undefined);
  getUserAffiliationsMock.mockReset();
  recordCorpAccessDecisionMock.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('decideCorpAccess', () => {
  it('allows a member and records the granting character', async () => {
    getUserAffiliationsMock.mockResolvedValue([rowFor(101, 2000, FRESH)]);

    const decision = await decideCorpAccess({ userId: 'u1', corporationId: 2000 });

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

  it('denies a non-member and records the deny (no granting character)', async () => {
    getUserAffiliationsMock.mockResolvedValue([rowFor(101, 2000, FRESH)]);

    const decision = await decideCorpAccess({ userId: 'u1', corporationId: 3000 });

    expect(decision).toEqual({ allowed: false, reason: 'not_member', characterId: null });
    expect(recordCorpAccessDecisionMock).toHaveBeenCalledWith({
      userId: 'u1',
      corporationId: 3000,
      characterId: null,
      allowed: false,
      reason: 'not_member',
    });
  });

  it('refreshes a stale affiliation before deciding, then allows on the fresh re-read', async () => {
    // First read (the stale-scan) sees a stale member; the refresh flips it fresh;
    // the second read (the decision) sees the fresh member and allows.
    getUserAffiliationsMock
      .mockResolvedValueOnce([rowFor(101, 2000, STALE)])
      .mockResolvedValueOnce([rowFor(101, 2000, FRESH)]);
    fetchAffiliationsMock.mockResolvedValue([
      { characterId: 101, corporationId: 2000, allianceId: null, factionId: null },
    ]);

    const decision = await decideCorpAccess({ userId: 'u1', corporationId: 2000 });

    // The stale character was refreshed (decision is NOT made on the pre-refresh data)...
    expect(fetchAffiliationsMock).toHaveBeenCalledWith([101]);
    // ...and the verdict reflects the post-refresh read.
    expect(decision).toEqual({ allowed: true, reason: 'member', characterId: 101 });
  });

  it('fails closed when a refresh cannot reach ESI: never-refreshed data stays a deny', async () => {
    // A never-refreshed affiliation; the refresh attempt fails (ESI down) and is
    // swallowed, so the data is still null on the decision read → deny.
    getUserAffiliationsMock.mockResolvedValue([rowFor(101, 2000, null)]);
    fetchAffiliationsMock.mockRejectedValue(new Error('ESI unreachable'));

    const decision = await decideCorpAccess({ userId: 'u1', corporationId: 2000 });

    expect(fetchAffiliationsMock).toHaveBeenCalledWith([101]); // a refresh WAS attempted
    expect(decision).toEqual({ allowed: false, reason: 'not_member', characterId: null });
    // The deny is still audited.
    expect(recordCorpAccessDecisionMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', corporationId: 2000, allowed: false }),
    );
  });
});

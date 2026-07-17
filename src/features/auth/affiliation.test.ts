import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { CachedAffiliation } from './membership';

const AFFILIATION_WINDOW_MS = freshnessGate('affiliations').ttlMs;

// The ESI source and the Neon readers/writer are mocked — this exercises the
// orchestration (refresh) + the fail-closed membership composition in isolation.
const fetchAffiliationsMock = vi.fn();
const upsertAffiliationsMock = vi.fn();
const getUserAffiliationsMock = vi.fn();
const getCharacterAffiliationMock = vi.fn();

vi.mock('./affiliation-source', () => ({
  fetchAffiliations: (...args: unknown[]) => fetchAffiliationsMock(...args),
}));
vi.mock('./affiliation-store', () => ({
  upsertAffiliations: (...args: unknown[]) => upsertAffiliationsMock(...args),
  getUserAffiliations: (...args: unknown[]) => getUserAffiliationsMock(...args),
  getCharacterAffiliation: (...args: unknown[]) => getCharacterAffiliationMock(...args),
}));

import {
  isCharacterCurrentMemberOfCorp,
  isUserCurrentMemberOfCorp,
  refreshAffiliations,
  refreshStaleAffiliationsForUser,
} from './affiliation';

function freshRow(corporationId: number): CachedAffiliation {
  return {
    characterId: 101,
    corporationId,
    allianceId: null,
    factionId: null,
    refreshedAt: new Date(Date.now() - 1_000),
  };
}
function staleRow(corporationId: number): CachedAffiliation {
  return {
    characterId: 101,
    corporationId,
    allianceId: null,
    factionId: null,
    refreshedAt: new Date(Date.now() - AFFILIATION_WINDOW_MS - 1_000),
  };
}

beforeEach(() => {
  fetchAffiliationsMock.mockReset();
  upsertAffiliationsMock.mockReset();
  getUserAffiliationsMock.mockReset();
  getCharacterAffiliationMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('refreshAffiliations', () => {
  it('fetches then upserts and returns the row count', async () => {
    const rows = [{ characterId: 101, corporationId: 2000, allianceId: null, factionId: null }];
    fetchAffiliationsMock.mockResolvedValue(rows);
    upsertAffiliationsMock.mockResolvedValue(undefined);

    expect(await refreshAffiliations([101])).toBe(1);
    expect(fetchAffiliationsMock).toHaveBeenCalledWith([101]);
    expect(upsertAffiliationsMock).toHaveBeenCalledWith(rows);
  });

  it('short-circuits empty input (no fetch, no upsert)', async () => {
    expect(await refreshAffiliations([])).toBe(0);
    expect(fetchAffiliationsMock).not.toHaveBeenCalled();
    expect(upsertAffiliationsMock).not.toHaveBeenCalled();
  });

  it('never throws and returns 0 when the source fails', async () => {
    fetchAffiliationsMock.mockRejectedValue(new Error('boom'));
    expect(await refreshAffiliations([101])).toBe(0);
    expect(upsertAffiliationsMock).not.toHaveBeenCalled();
  });
});

describe('refreshStaleAffiliationsForUser', () => {
  function rowFor(characterId: number, refreshedAt: Date | null): CachedAffiliation {
    return { characterId, corporationId: 2000, allianceId: null, factionId: null, refreshedAt };
  }
  const FRESH_AT = new Date(Date.now() - 1_000);
  const STALE_AT = new Date(Date.now() - AFFILIATION_WINDOW_MS - 1_000);

  it('refreshes only the stale and never-refreshed characters, not the fresh ones', async () => {
    getUserAffiliationsMock.mockResolvedValue([
      rowFor(101, FRESH_AT),
      rowFor(102, STALE_AT),
      rowFor(103, null),
    ]);
    fetchAffiliationsMock.mockResolvedValue([]);
    upsertAffiliationsMock.mockResolvedValue(undefined);

    await refreshStaleAffiliationsForUser('u1');

    expect(fetchAffiliationsMock).toHaveBeenCalledWith([102, 103]);
  });

  it('does not reach ESI when every affiliation is fresh', async () => {
    getUserAffiliationsMock.mockResolvedValue([rowFor(101, FRESH_AT)]);

    expect(await refreshStaleAffiliationsForUser('u1')).toBe(0);
    expect(fetchAffiliationsMock).not.toHaveBeenCalled();
  });

  it('returns the number of rows refreshed', async () => {
    getUserAffiliationsMock.mockResolvedValue([rowFor(102, STALE_AT)]);
    fetchAffiliationsMock.mockResolvedValue([
      { characterId: 102, corporationId: 2000, allianceId: null, factionId: null },
    ]);
    upsertAffiliationsMock.mockResolvedValue(undefined);

    expect(await refreshStaleAffiliationsForUser('u1')).toBe(1);
  });
});

describe('isUserCurrentMemberOfCorp', () => {
  it('allows a user with a fresh linked character in the corp', async () => {
    getUserAffiliationsMock.mockResolvedValue([freshRow(2000)]);
    expect(await isUserCurrentMemberOfCorp('u1', 2000)).toBe(true);
  });

  it('denies a corp the user is not in', async () => {
    getUserAffiliationsMock.mockResolvedValue([freshRow(2000)]);
    expect(await isUserCurrentMemberOfCorp('u1', 3000)).toBe(false);
  });

  it('denies when the only matching character is stale (fail closed)', async () => {
    getUserAffiliationsMock.mockResolvedValue([staleRow(2000)]);
    expect(await isUserCurrentMemberOfCorp('u1', 2000)).toBe(false);
  });
});

describe('isCharacterCurrentMemberOfCorp', () => {
  it('allows a fresh matching character', async () => {
    getCharacterAffiliationMock.mockResolvedValue(freshRow(2000));
    expect(await isCharacterCurrentMemberOfCorp(101, 2000)).toBe(true);
  });

  it('denies an unknown character (null affiliation)', async () => {
    getCharacterAffiliationMock.mockResolvedValue(null);
    expect(await isCharacterCurrentMemberOfCorp(101, 2000)).toBe(false);
  });

  it('denies a stale matching character (fail closed)', async () => {
    getCharacterAffiliationMock.mockResolvedValue(staleRow(2000));
    expect(await isCharacterCurrentMemberOfCorp(101, 2000)).toBe(false);
  });
});

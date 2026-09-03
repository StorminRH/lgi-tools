import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { CachedAffiliation } from './membership';

const AFFILIATION_WINDOW_MS = freshnessGate('affiliations').ttlMs;

const fetchAffiliationsMock = vi.fn();
const updateAffiliationsMock = vi.fn();
const getUserAffiliationsMock = vi.fn();
const getCharacterAffiliationMock = vi.fn();

vi.mock('./affiliation-source', () => ({
  fetchAffiliations: (...args: unknown[]) => fetchAffiliationsMock(...args),
}));
vi.mock('./affiliation-store', () => ({
  updateAffiliations: (...args: unknown[]) => updateAffiliationsMock(...args),
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

function rowFor(characterId: number, refreshedAt: Date | null): CachedAffiliation {
  return { characterId, corporationId: 2000, allianceId: null, factionId: null, refreshedAt };
}

beforeEach(() => {
  fetchAffiliationsMock.mockReset();
  updateAffiliationsMock.mockReset();
  getUserAffiliationsMock.mockReset();
  getCharacterAffiliationMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

test('refreshAffiliations fetches then upserts, short-circuits empty input, and swallows source failures', async () => {
  const rows = [{ characterId: 101, corporationId: 2000, allianceId: null, factionId: null }];
  fetchAffiliationsMock.mockResolvedValue({ rows, transientFailure: false });
  updateAffiliationsMock.mockResolvedValue(undefined);

  expect(await refreshAffiliations([101])).toBe(1);
  expect(fetchAffiliationsMock).toHaveBeenCalledWith([101]);
  expect(updateAffiliationsMock).toHaveBeenCalledWith(rows);

  fetchAffiliationsMock.mockClear();
  updateAffiliationsMock.mockClear();
  expect(await refreshAffiliations([])).toBe(0);
  expect(fetchAffiliationsMock).not.toHaveBeenCalled();
  expect(updateAffiliationsMock).not.toHaveBeenCalled();

  fetchAffiliationsMock.mockRejectedValue(new Error('boom'));
  expect(await refreshAffiliations([101])).toBe(0);
  expect(updateAffiliationsMock).not.toHaveBeenCalled();
});

test('refreshStaleAffiliationsForUser refreshes only stale and never-refreshed characters', async () => {
  const FRESH_AT = new Date(Date.now() - 1_000);
  const STALE_AT = new Date(Date.now() - AFFILIATION_WINDOW_MS - 1_000);

  getUserAffiliationsMock.mockResolvedValue([
    rowFor(101, FRESH_AT),
    rowFor(102, STALE_AT),
    rowFor(103, null),
  ]);
  fetchAffiliationsMock.mockResolvedValue({
    rows: [{ characterId: 102, corporationId: 2000, allianceId: null, factionId: null }],
    transientFailure: false,
  });
  updateAffiliationsMock.mockResolvedValue(undefined);

  expect(await refreshStaleAffiliationsForUser('u1')).toBe(1);
  expect(fetchAffiliationsMock).toHaveBeenCalledWith([102, 103]);

  getUserAffiliationsMock.mockResolvedValue([rowFor(101, FRESH_AT)]);
  fetchAffiliationsMock.mockClear();
  expect(await refreshStaleAffiliationsForUser('u1')).toBe(0);
  expect(fetchAffiliationsMock).not.toHaveBeenCalled();
});

test('membership wrappers load cached rows and apply the fail-closed predicates', async () => {
  getUserAffiliationsMock
    .mockResolvedValueOnce([freshRow(2000)])
    .mockResolvedValueOnce([freshRow(2000)])
    .mockResolvedValueOnce([staleRow(2000)]);
  expect(await isUserCurrentMemberOfCorp('u1', 2000)).toBe(true);
  expect(await isUserCurrentMemberOfCorp('u1', 3000)).toBe(false);
  expect(await isUserCurrentMemberOfCorp('u1', 2000)).toBe(false);

  getCharacterAffiliationMock
    .mockResolvedValueOnce(freshRow(2000))
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(staleRow(2000));
  expect(await isCharacterCurrentMemberOfCorp(101, 2000)).toBe(true);
  expect(await isCharacterCurrentMemberOfCorp(101, 2000)).toBe(false);
  expect(await isCharacterCurrentMemberOfCorp(101, 2000)).toBe(false);
});

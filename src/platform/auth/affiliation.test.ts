import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { CachedAffiliation } from './membership';

const AFFILIATION_WINDOW_MS = freshnessGate('affiliations').ttlMs;

const fetchAffiliationsMock = vi.fn();
const updateAffiliationsMock = vi.fn();
const getUserAffiliationsMock = vi.fn();

vi.mock('./affiliation-source', () => ({
  fetchAffiliations: (...args: unknown[]) => fetchAffiliationsMock(...args),
}));
vi.mock('./affiliation-store', () => ({
  updateAffiliations: (...args: unknown[]) => updateAffiliationsMock(...args),
  getUserAffiliations: (...args: unknown[]) => getUserAffiliationsMock(...args),
}));

import {
  refreshAffiliations,
  refreshStaleAffiliationsForUser,
} from './affiliation';

function rowFor(characterId: number, refreshedAt: Date | null): CachedAffiliation {
  return { characterId, corporationId: 2000, allianceId: null, factionId: null, refreshedAt };
}

beforeEach(() => {
  fetchAffiliationsMock.mockReset();
  updateAffiliationsMock.mockReset();
  getUserAffiliationsMock.mockReset();
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

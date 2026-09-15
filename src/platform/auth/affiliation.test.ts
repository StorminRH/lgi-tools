import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchAffiliations: vi.fn(), updateAffiliations: vi.fn() }));
vi.mock('./affiliation-source', () => ({ fetchAffiliations: mocks.fetchAffiliations }));
vi.mock('./affiliation-store', () => ({ updateAffiliations: mocks.updateAffiliations }));

import { refreshAffiliations, refreshAffiliationsWithOutcome } from './affiliation';

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

test('returns database-confirmed counts, preserving partial source failure', async () => {
  const rows = [
    { characterId: 101, corporationId: 2000, allianceId: null, factionId: null },
    { characterId: 102, corporationId: 2000, allianceId: null, factionId: null },
  ];
  mocks.fetchAffiliations.mockResolvedValue({ rows, transientFailure: true });
  mocks.updateAffiliations.mockResolvedValue({ refreshed: 1, accessChanged: true });
  await expect(refreshAffiliationsWithOutcome([101, 102])).resolves.toEqual({ refreshed: 1, accessChanged: true, transientFailure: true });
  expect(mocks.updateAffiliations).toHaveBeenCalledWith(rows, expect.any(Date));
  await expect(refreshAffiliations([101, 102])).resolves.toBe(1);
});

test('does no work for empty input and fails closed when persistence fails', async () => {
  await expect(refreshAffiliationsWithOutcome([])).resolves.toEqual({ refreshed: 0, accessChanged: false, transientFailure: false });
  expect(mocks.fetchAffiliations).not.toHaveBeenCalled();
  expect(mocks.updateAffiliations).not.toHaveBeenCalled();
  mocks.fetchAffiliations.mockResolvedValue({ rows: [{ characterId: 101 }], transientFailure: false });
  mocks.updateAffiliations.mockRejectedValue(new Error('database unavailable'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(refreshAffiliationsWithOutcome([101])).resolves.toEqual({ refreshed: 0, accessChanged: false, transientFailure: true });
});

test('persists confirmed departures even alongside transient gaps', async () => {
  const rows = [
    { characterId: 101, corporationId: 2000, allianceId: null, factionId: null },
    { characterId: 102, corporationId: null, allianceId: null, factionId: null },
  ];
  mocks.fetchAffiliations.mockResolvedValue({ rows, transientFailure: true });
  mocks.updateAffiliations.mockResolvedValue({ refreshed: 2, accessChanged: true });
  await expect(refreshAffiliationsWithOutcome([101, 102, 103])).resolves.toEqual({
    refreshed: 2, accessChanged: true, transientFailure: true,
  });
  expect(mocks.updateAffiliations).toHaveBeenCalledWith(rows, expect.any(Date));
});

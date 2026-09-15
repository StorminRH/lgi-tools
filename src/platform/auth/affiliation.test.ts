import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const fetchAffiliationsMock = vi.fn();
const updateAffiliationsMock = vi.fn();

vi.mock('./affiliation-source', () => ({
  fetchAffiliations: (...args: unknown[]) => fetchAffiliationsMock(...args),
}));
vi.mock('./affiliation-store', () => ({
  updateAffiliations: (...args: unknown[]) => updateAffiliationsMock(...args),
}));

import {
  refreshAffiliations,
  refreshAffiliationsWithRows,
} from './affiliation';

beforeEach(() => {
  fetchAffiliationsMock.mockReset();
  updateAffiliationsMock.mockReset();
});
afterEach(() => vi.restoreAllMocks());

test('refreshAffiliations fetches then upserts, short-circuits empty input, and swallows source failures', async () => {
  const rows = [{ characterId: 101, corporationId: 2000, allianceId: null, factionId: null }];
  fetchAffiliationsMock.mockResolvedValue({ rows, transientFailure: false });
  updateAffiliationsMock.mockResolvedValue([101]);

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

test('refreshAffiliationsWithRows returns only confirmed rows for the in-memory merge', async () => {
  const rows = [
    { characterId: 101, corporationId: 2000, allianceId: null, factionId: null },
    { characterId: 102, corporationId: 3000, allianceId: null, factionId: null },
  ];
  fetchAffiliationsMock.mockResolvedValue({ rows, transientFailure: false });
  updateAffiliationsMock.mockResolvedValue([101]);

  await expect(refreshAffiliationsWithRows([101, 102])).resolves.toEqual({
    rows: [rows[0]],
    transientFailure: false,
  });
  expect(updateAffiliationsMock).toHaveBeenCalledWith(rows);
});

test('refreshAffiliationsWithRows short-circuits empty input and swallows failures', async () => {
  await expect(refreshAffiliationsWithRows([])).resolves.toEqual({
    rows: [],
    transientFailure: false,
  });
  expect(fetchAffiliationsMock).not.toHaveBeenCalled();
  expect(updateAffiliationsMock).not.toHaveBeenCalled();

  fetchAffiliationsMock.mockRejectedValue(new Error('boom'));
  await expect(refreshAffiliationsWithRows([101])).resolves.toEqual({
    rows: [],
    transientFailure: true,
  });
  expect(updateAffiliationsMock).not.toHaveBeenCalled();

  fetchAffiliationsMock.mockResolvedValue({
    rows: [{ characterId: 101, corporationId: 2000, allianceId: null, factionId: null }],
    transientFailure: false,
  });
  updateAffiliationsMock.mockRejectedValue(new Error('db unavailable'));
  await expect(refreshAffiliationsWithRows([101])).resolves.toEqual({
    rows: [],
    transientFailure: true,
  });
});

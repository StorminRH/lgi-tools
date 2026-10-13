import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';

const mocks = vi.hoisted(() => ({
  fetchAffiliations: vi.fn(),
  updateAffiliations: vi.fn(),
  captureAffiliationObservedAt: vi.fn(),
  recordExpiryFor: vi.fn(),
}));
vi.mock('./affiliation-source', () => ({ fetchAffiliations: mocks.fetchAffiliations }));
vi.mock('./affiliation-store', () => ({
  updateAffiliations: mocks.updateAffiliations,
  captureAffiliationObservedAt: mocks.captureAffiliationObservedAt,
}));
vi.mock('@/data/esi-store', () => ({ recordExpiryFor: (...args: unknown[]) => mocks.recordExpiryFor(...args) }));

import { refreshAffiliationsWithOutcome } from './affiliation';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.captureAffiliationObservedAt.mockResolvedValue('2026-09-15 12:00:00.000001');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('returns database-confirmed counts, preserving partial source failure and confirmed departures, and records each batch\'s expiry per character after the rows stood', async () => {
  const rows = [
    { characterId: 101, corporationId: 2000, allianceId: null, factionId: null },
    { characterId: 102, corporationId: null, allianceId: null, factionId: null },
  ];
  const stamp = { expiresAt: 1_800_000_000_000, lastModified: null, checkedAt: 1_799_999_000_000 };
  mocks.fetchAffiliations.mockResolvedValue({ rows, transientFailure: true, answers: [{ characterIds: [101, 102], stamp }] });
  mocks.updateAffiliations.mockResolvedValue({ refreshed: 2, accessChanged: true });
  await expect(refreshAffiliationsWithOutcome([101, 102, 103])).resolves.toEqual({
    refreshed: 2, accessChanged: true, transientFailure: true,
  });
  expect(mocks.captureAffiliationObservedAt.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.fetchAffiliations.mock.invocationCallOrder[0]!,
  );
  expect(mocks.updateAffiliations).toHaveBeenCalledWith(rows, '2026-09-15 12:00:00.000001');
  expect(mocks.recordExpiryFor).toHaveBeenCalledExactlyOnceWith(
    [
      { route: '/characters/affiliation/', holder: { kind: 'character', id: 101 } },
      { route: '/characters/affiliation/', holder: { kind: 'character', id: 102 } },
    ],
    stamp,
  );
  expect(mocks.recordExpiryFor.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.updateAffiliations.mock.invocationCallOrder[0]!);
});

test('does no work for empty input and fails closed when persistence fails', async () => {
  await expect(refreshAffiliationsWithOutcome([])).resolves.toEqual({ refreshed: 0, accessChanged: false, transientFailure: false });
  expect(mocks.captureAffiliationObservedAt).not.toHaveBeenCalled();
  expect(mocks.fetchAffiliations).not.toHaveBeenCalled();
  expect(mocks.updateAffiliations).not.toHaveBeenCalled();
  mocks.fetchAffiliations.mockResolvedValue({ rows: [{ characterId: 101 }], transientFailure: false, answers: [{ characterIds: [101], stamp: { expiresAt: 1, lastModified: null, checkedAt: 0 } }] });
  mocks.updateAffiliations.mockRejectedValue(new Error('database unavailable'));
  silenceConsolePrefixes('error', ['[auth/affiliation] refresh failed']);
  await expect(refreshAffiliationsWithOutcome([101])).resolves.toEqual({ refreshed: 0, accessChanged: false, transientFailure: true });
  expect(mocks.recordExpiryFor).not.toHaveBeenCalled();
});

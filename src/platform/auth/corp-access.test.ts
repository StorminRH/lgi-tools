import { expect, test } from 'vitest';
import type { CachedAffiliation } from './affiliation-store';
import { createCorpAccessSnapshot } from './corp-access';

const NOW = new Date('2026-09-15T12:00:00Z');
const UNEXPIRED = new Date(NOW.getTime() + 60 * 60_000);
const EXPIRED = new Date(NOW.getTime() - 1);

function row(characterId: number, corporationId: number | null, expiresAt: Date | null = UNEXPIRED): CachedAffiliation {
  return { sharedAccessEligible: true, characterId, corporationId, allianceId: null, factionId: null, refreshedAt: NOW, expiresAt };
}

test('groups unexpired members, drops expired, unrecorded and null corps, treats the expiry instant as expired, and freezes the snapshot', () => {
  const members = createCorpAccessSnapshot('u1', [row(101, 2000), row(102, 2000), row(103, null)], false, NOW.getTime());
  expect(members.allCharacterIds).toEqual([101, 102, 103]);
  expect(members.corporationIds).toEqual([2000]);
  expect(members.characterIdsByCorporation[2000]).toEqual([101, 102]);
  expect(members.refreshTransientFailure).toBe(false);
  expect(members.resolvedAt).toBe(NOW.getTime());

  const stale = createCorpAccessSnapshot('u1', [row(101, 2000, EXPIRED), row(102, null), row(103, 3000), row(104, 4000, null)], false, NOW.getTime());
  expect(stale.allCharacterIds).toEqual([101, 102, 103, 104]);
  expect(stale.corporationIds).toEqual([3000]);
  expect(stale.characterIdsByCorporation[2000]).toBeUndefined();
  expect(stale.characterIdsByCorporation[3000]).toEqual([103]);

  const boundary = createCorpAccessSnapshot('u1', [row(101, 2000, NOW)], false, NOW.getTime());
  expect(boundary.corporationIds).toEqual([]);

  expect(Object.isFrozen(members)).toBe(true);
  expect(Object.isFrozen(members.allCharacterIds)).toBe(true);
  expect(Object.isFrozen(members.corporationIds)).toBe(true);
  expect(Object.isFrozen(members.characterIdsByCorporation)).toBe(true);
  expect(Object.isFrozen(members.characterIdsByCorporation[2000])).toBe(true);
});

test('excludes disconnected shared principals while retaining personal identity and another valid corp member', () => {
  const alice = { ...row(101, 2000), sharedAccessEligible: false };
  const bob = row(102, 2000);
  const snapshot = createCorpAccessSnapshot('u1', [alice, bob], false, NOW.getTime());
  expect(snapshot.allCharacterIds).toEqual([101, 102]);
  expect(snapshot.authorizedCharacterIds).toEqual([102]);
  expect(snapshot.characterIdsByCorporation[2000]).toEqual([102]);
  expect(snapshot.corporationIds).toEqual([2000]);
  const disconnected = createCorpAccessSnapshot('u1', [alice], false, NOW.getTime());
  expect(disconnected.allCharacterIds).toEqual([101]);
  expect(disconnected.authorizedCharacterIds).toEqual([]);
  expect(disconnected.corporationIds).toEqual([]);
});

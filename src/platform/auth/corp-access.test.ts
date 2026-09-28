import { expect, test } from 'vitest';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { CachedAffiliation } from './affiliation-store';
import { createCorpAccessSnapshot } from './corp-access';

const NOW = new Date('2026-09-15T12:00:00Z');
const TTL = freshnessGate('affiliations').ttlMs;
const FRESH = NOW;
const STALE = new Date(NOW.getTime() - TTL - 1);

function row(characterId: number, corporationId: number | null, refreshedAt: Date | null = FRESH): CachedAffiliation {
  return { characterId, corporationId, allianceId: null, factionId: null, refreshedAt };
}

test('groups fresh members, drops stale and null corps, treats the TTL boundary as fresh, and freezes the snapshot', () => {
  const members = createCorpAccessSnapshot('u1', [row(101, 2000), row(102, 2000), row(103, null)], false, NOW.getTime());
  expect(members.allCharacterIds).toEqual([101, 102, 103]);
  expect(members.corporationIds).toEqual([2000]);
  expect(members.characterIdsByCorporation[2000]).toEqual([101, 102]);
  expect(members.refreshTransientFailure).toBe(false);
  expect(members.resolvedAt).toBe(NOW.getTime());

  const stale = createCorpAccessSnapshot('u1', [row(101, 2000, STALE), row(102, null), row(103, 3000)], false, NOW.getTime());
  expect(stale.allCharacterIds).toEqual([101, 102, 103]);
  expect(stale.corporationIds).toEqual([3000]);
  expect(stale.characterIdsByCorporation[2000]).toBeUndefined();
  expect(stale.characterIdsByCorporation[3000]).toEqual([103]);

  const boundary = createCorpAccessSnapshot(
    'u1',
    [row(101, 2000, new Date(NOW.getTime() - TTL))],
    false,
    NOW.getTime(),
  );
  expect(boundary.corporationIds).toEqual([2000]);
  expect(boundary.characterIdsByCorporation[2000]).toEqual([101]);

  expect(Object.isFrozen(members)).toBe(true);
  expect(Object.isFrozen(members.allCharacterIds)).toBe(true);
  expect(Object.isFrozen(members.corporationIds)).toBe(true);
  expect(Object.isFrozen(members.characterIdsByCorporation)).toBe(true);
  expect(Object.isFrozen(members.characterIdsByCorporation[2000])).toBe(true);
});

import { expect, test } from 'vitest';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import {
  type CachedAffiliation,
  characterIsInCorp,
  isMemberOfCorp,
  memberCharacterIdInCorp,
  memberCharacterIdsInCorp,
  memberCorpIds,
} from './membership';

const AFFILIATION_FRESHNESS = freshnessGate('affiliations');
const AFFILIATION_WINDOW_MS = AFFILIATION_FRESHNESS.ttlMs;
const NOW = new Date('2026-06-25T12:00:00.000Z');
const FRESH = new Date(NOW.getTime() - 1_000);
const STALE = new Date(NOW.getTime() - AFFILIATION_WINDOW_MS - 1_000);
const EXACT_TTL = new Date(NOW.getTime() - AFFILIATION_WINDOW_MS);

function aff(overrides: Partial<CachedAffiliation> = {}): CachedAffiliation {
  return {
    characterId: 101,
    corporationId: 2000,
    allianceId: null,
    factionId: null,
    refreshedAt: FRESH,
    ...overrides,
  };
}

test('freshness gate treats null and older-than-TTL as stale; inclusive TTL and recent are fresh', () => {
  expect(AFFILIATION_FRESHNESS.isStale(null, NOW)).toBe(true);
  expect(AFFILIATION_FRESHNESS.isStale(STALE, NOW)).toBe(true);
  expect(AFFILIATION_FRESHNESS.isStale(FRESH, NOW)).toBe(false);
  expect(AFFILIATION_FRESHNESS.isStale(EXACT_TTL, NOW)).toBe(false);
});

test('membership predicates fail closed on stale, never-refreshed, empty, and null corp', () => {
  const stale = [aff({ corporationId: 2000, refreshedAt: STALE })];
  const never = [aff({ corporationId: 2000, refreshedAt: null })];
  const empty: CachedAffiliation[] = [];
  const nullCorp = [aff({ corporationId: null })];

  expect(isMemberOfCorp(stale, 2000, NOW)).toBe(false);
  expect(isMemberOfCorp(never, 2000, NOW)).toBe(false);
  expect(isMemberOfCorp(empty, 2000, NOW)).toBe(false);
  expect(isMemberOfCorp(nullCorp, 2000, NOW)).toBe(false);

  expect(memberCharacterIdInCorp(stale, 2000, NOW)).toBeNull();
  expect(memberCharacterIdInCorp(never, 2000, NOW)).toBeNull();
  expect(memberCharacterIdInCorp(empty, 2000, NOW)).toBeNull();

  expect(memberCorpIds(stale, NOW)).toEqual([]);
  expect(memberCorpIds(never, NOW)).toEqual([]);
  expect(memberCorpIds(nullCorp, NOW)).toEqual([]);
  expect(memberCorpIds(empty, NOW)).toEqual([]);

  expect(characterIsInCorp(stale[0], 2000, NOW)).toBe(false);
  expect(characterIsInCorp(null, 2000, NOW)).toBe(false);
});

test('isMemberOfCorp allows any fresh linked member and revokes after a corp change', () => {
  expect(isMemberOfCorp([aff({ corporationId: 2000 })], 2000, NOW)).toBe(true);
  expect(isMemberOfCorp([aff({ corporationId: 2000 })], 3000, NOW)).toBe(false);
  expect(isMemberOfCorp([aff({ corporationId: 3000 })], 2000, NOW)).toBe(false);
  expect(
    isMemberOfCorp(
      [aff({ characterId: 101, corporationId: 3000 }), aff({ characterId: 102, corporationId: 2000 })],
      2000,
      NOW,
    ),
  ).toBe(true);
});

test('memberCharacterIdInCorp returns the first fresh matching pilot for the audit', () => {
  expect(memberCharacterIdInCorp([aff({ characterId: 101, corporationId: 2000 })], 2000, NOW)).toBe(
    101,
  );
  expect(memberCharacterIdInCorp([aff({ corporationId: 2000 })], 3000, NOW)).toBeNull();
  expect(
    memberCharacterIdInCorp(
      [
        aff({ characterId: 101, corporationId: 2000, refreshedAt: STALE }),
        aff({ characterId: 102, corporationId: 2000 }),
      ],
      2000,
      NOW,
    ),
  ).toBe(102);
});

test('memberCharacterIdsInCorp and memberCorpIds collect distinct fresh members', () => {
  const affiliations = [
    aff({ characterId: 101, corporationId: 2000 }),
    aff({ characterId: 102, corporationId: 2000 }),
    aff({ characterId: 103, corporationId: 3000 }),
    aff({ characterId: 104, corporationId: 4000, refreshedAt: STALE }),
  ];
  expect(memberCharacterIdsInCorp(affiliations, 2000, NOW).sort((a, b) => a - b)).toEqual([101, 102]);
  expect(
    memberCharacterIdsInCorp(
      [
        aff({ characterId: 101, corporationId: 2000, refreshedAt: STALE }),
        aff({ characterId: 102, corporationId: 2000, refreshedAt: null }),
        aff({ characterId: 103, corporationId: 2000 }),
      ],
      2000,
      NOW,
    ),
  ).toEqual([103]);
  expect(memberCharacterIdsInCorp([aff({ corporationId: 3000 })], 2000, NOW)).toEqual([]);

  expect(memberCorpIds([aff({ corporationId: 2000 })], NOW)).toEqual([2000]);
  expect(memberCorpIds([aff({ corporationId: 3000 })], NOW)).not.toContain(2000);
  expect(memberCorpIds(affiliations, NOW).sort((a, b) => a - b)).toEqual([2000, 3000]);
});

test('characterIsInCorp allows a fresh match and denies a mismatched corp', () => {
  expect(characterIsInCorp(aff({ corporationId: 2000 }), 2000, NOW)).toBe(true);
  expect(characterIsInCorp(aff({ corporationId: 3000 }), 2000, NOW)).toBe(false);
});

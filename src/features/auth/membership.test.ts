import { describe, expect, it } from 'vitest';
import {
  AFFILIATION_TTL_MS,
  type CachedAffiliation,
  characterIsInCorp,
  isAffiliationStale,
  isMemberOfCorp,
  memberCharacterIdInCorp,
  memberCharacterIdsInCorp,
  memberCorpIds,
} from './membership';

const NOW = new Date('2026-06-25T12:00:00.000Z');
const FRESH = new Date(NOW.getTime() - 1_000); // 1s ago
const STALE = new Date(NOW.getTime() - AFFILIATION_TTL_MS - 1_000); // > TTL ago

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

describe('isAffiliationStale', () => {
  it('treats a never-refreshed (null) affiliation as stale', () => {
    expect(isAffiliationStale(null, NOW)).toBe(true);
  });

  it('treats an affiliation older than the TTL as stale', () => {
    expect(isAffiliationStale(STALE, NOW)).toBe(true);
  });

  it('treats a recently-refreshed affiliation as fresh', () => {
    expect(isAffiliationStale(FRESH, NOW)).toBe(false);
  });

  it('treats exactly-at-the-TTL boundary as fresh (the window is inclusive)', () => {
    const exactly = new Date(NOW.getTime() - AFFILIATION_TTL_MS);
    expect(isAffiliationStale(exactly, NOW)).toBe(false);
  });
});

describe('isMemberOfCorp (allow/deny by corp)', () => {
  it('allows when a linked character has a fresh affiliation in the corp', () => {
    expect(isMemberOfCorp([aff({ corporationId: 2000 })], 2000, NOW)).toBe(true);
  });

  it('denies a corp the user is not in', () => {
    expect(isMemberOfCorp([aff({ corporationId: 2000 })], 3000, NOW)).toBe(false);
  });

  it('denies a matching corp whose affiliation is stale (fail closed)', () => {
    expect(isMemberOfCorp([aff({ corporationId: 2000, refreshedAt: STALE })], 2000, NOW)).toBe(false);
  });

  it('denies a matching corp that was never refreshed (fail closed)', () => {
    expect(isMemberOfCorp([aff({ corporationId: 2000, refreshedAt: null })], 2000, NOW)).toBe(false);
  });

  it('revokes after a corp change: the cached corp flipped, so the old corp denies', () => {
    // The pilot left 2000 for 3000; the refresh that flipped the cached id is what
    // revokes — membership in 2000 now reads false.
    expect(isMemberOfCorp([aff({ corporationId: 3000 })], 2000, NOW)).toBe(false);
  });

  it('allows when ANY of several linked characters is a fresh member', () => {
    const affiliations = [
      aff({ characterId: 101, corporationId: 3000 }),
      aff({ characterId: 102, corporationId: 2000 }),
    ];
    expect(isMemberOfCorp(affiliations, 2000, NOW)).toBe(true);
  });

  it('denies on an empty affiliation set', () => {
    expect(isMemberOfCorp([], 2000, NOW)).toBe(false);
  });

  it('denies a null cached corp even with a fresh timestamp', () => {
    expect(isMemberOfCorp([aff({ corporationId: null })], 2000, NOW)).toBe(false);
  });
});

describe('memberCharacterIdInCorp (the granting pilot, for the audit)', () => {
  it('returns the id of a fresh matching character', () => {
    expect(memberCharacterIdInCorp([aff({ characterId: 101, corporationId: 2000 })], 2000, NOW)).toBe(
      101,
    );
  });

  it('returns null for a corp none of the characters is in', () => {
    expect(memberCharacterIdInCorp([aff({ corporationId: 2000 })], 3000, NOW)).toBeNull();
  });

  it('returns null when the only matching character is stale (fail closed)', () => {
    expect(
      memberCharacterIdInCorp([aff({ corporationId: 2000, refreshedAt: STALE })], 2000, NOW),
    ).toBeNull();
  });

  it('returns null when the only matching character was never refreshed (fail closed)', () => {
    expect(
      memberCharacterIdInCorp([aff({ corporationId: 2000, refreshedAt: null })], 2000, NOW),
    ).toBeNull();
  });

  it('returns the first fresh member, skipping a stale matching character', () => {
    const affiliations = [
      aff({ characterId: 101, corporationId: 2000, refreshedAt: STALE }),
      aff({ characterId: 102, corporationId: 2000 }),
    ];
    expect(memberCharacterIdInCorp(affiliations, 2000, NOW)).toBe(102);
  });

  it('returns null on an empty affiliation set', () => {
    expect(memberCharacterIdInCorp([], 2000, NOW)).toBeNull();
  });
});

describe('memberCharacterIdsInCorp (every in-corp pilot, for the role gate)', () => {
  it('returns all fresh members of the corp', () => {
    const affiliations = [
      aff({ characterId: 101, corporationId: 2000 }),
      aff({ characterId: 102, corporationId: 2000 }),
      aff({ characterId: 103, corporationId: 3000 }),
    ];
    expect(memberCharacterIdsInCorp(affiliations, 2000, NOW).sort((a, b) => a - b)).toEqual([101, 102]);
  });

  it('excludes a stale or never-refreshed matching pilot (fail closed)', () => {
    const affiliations = [
      aff({ characterId: 101, corporationId: 2000, refreshedAt: STALE }),
      aff({ characterId: 102, corporationId: 2000, refreshedAt: null }),
      aff({ characterId: 103, corporationId: 2000 }),
    ];
    expect(memberCharacterIdsInCorp(affiliations, 2000, NOW)).toEqual([103]);
  });

  it('returns an empty list when no pilot is in the corp', () => {
    expect(memberCharacterIdsInCorp([aff({ corporationId: 3000 })], 2000, NOW)).toEqual([]);
  });
});

describe('memberCorpIds (the read-scope set for shared per-corp data)', () => {
  it('returns the corps a fresh member is in — and a non-member sees nothing of others', () => {
    // The shared-store read gate: a member of 2000 gets [2000]; a viewer in only
    // 3000 never sees 2000's catalogue.
    expect(memberCorpIds([aff({ corporationId: 2000 })], NOW)).toEqual([2000]);
    expect(memberCorpIds([aff({ corporationId: 3000 })], NOW)).not.toContain(2000);
  });

  it('excludes a stale or never-refreshed corp (fail closed)', () => {
    expect(memberCorpIds([aff({ corporationId: 2000, refreshedAt: STALE })], NOW)).toEqual([]);
    expect(memberCorpIds([aff({ corporationId: 2000, refreshedAt: null })], NOW)).toEqual([]);
  });

  it('excludes a null cached corp', () => {
    expect(memberCorpIds([aff({ corporationId: null })], NOW)).toEqual([]);
  });

  it('dedupes when several linked characters share a corp', () => {
    const affiliations = [
      aff({ characterId: 101, corporationId: 2000 }),
      aff({ characterId: 102, corporationId: 2000 }),
    ];
    expect(memberCorpIds(affiliations, NOW)).toEqual([2000]);
  });

  it('returns every distinct corp the user is a fresh member of', () => {
    const affiliations = [
      aff({ characterId: 101, corporationId: 2000 }),
      aff({ characterId: 102, corporationId: 3000 }),
      aff({ characterId: 103, corporationId: 4000, refreshedAt: STALE }), // excluded
    ];
    expect(memberCorpIds(affiliations, NOW).sort((a, b) => a - b)).toEqual([2000, 3000]);
  });

  it('returns an empty list on an empty affiliation set', () => {
    expect(memberCorpIds([], NOW)).toEqual([]);
  });
});

describe('characterIsInCorp (allow/deny by character)', () => {
  it('allows a fresh matching character', () => {
    expect(characterIsInCorp(aff({ corporationId: 2000 }), 2000, NOW)).toBe(true);
  });

  it('denies a null affiliation (unknown character)', () => {
    expect(characterIsInCorp(null, 2000, NOW)).toBe(false);
  });

  it('denies a stale matching character (fail closed)', () => {
    expect(characterIsInCorp(aff({ corporationId: 2000, refreshedAt: STALE }), 2000, NOW)).toBe(false);
  });

  it('denies a mismatched corp', () => {
    expect(characterIsInCorp(aff({ corporationId: 3000 }), 2000, NOW)).toBe(false);
  });
});

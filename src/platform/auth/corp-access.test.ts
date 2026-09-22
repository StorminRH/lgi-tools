import { describe, expect, it } from 'vitest';
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

describe('createCorpAccessSnapshot', () => {
  it('groups fresh member pilots while preserving all linked identities', () => {
    const access = createCorpAccessSnapshot('u1', [row(101, 2000), row(102, 2000), row(103, null)], false, NOW.getTime());
    expect(access.userId).toBe('u1');
    expect(access.allCharacterIds).toEqual([101, 102, 103]);
    expect(access.corporationIds).toEqual([2000]);
    expect(access.characterIdsByCorporation[2000]).toEqual([101, 102]);
    expect(access.refreshTransientFailure).toBe(false);
    expect(access.resolvedAt).toBe(NOW.getTime());
  });

  it('excludes stale and null memberships but keeps their character identities', () => {
    const access = createCorpAccessSnapshot('u1', [row(101, 2000, STALE), row(102, null), row(103, 3000)], false, NOW.getTime());
    expect(access.allCharacterIds).toEqual([101, 102, 103]);
    expect(access.corporationIds).toEqual([3000]);
    expect(access.characterIdsByCorporation[2000]).toBeUndefined();
    expect(access.characterIdsByCorporation[3000]).toEqual([103]);
  });

  it('treats the exact TTL boundary as fresh', () => {
    const boundary = new Date(NOW.getTime() - TTL);
    const access = createCorpAccessSnapshot('u1', [row(101, 2000, boundary)], false, NOW.getTime());
    expect(access.corporationIds).toEqual([2000]);
    expect(access.characterIdsByCorporation[2000]).toEqual([101]);
  });

  it('freezes the request-local snapshot', () => {
    const access = createCorpAccessSnapshot('u1', [row(101, 2000)], false, NOW.getTime());
    expect(Object.isFrozen(access)).toBe(true);
    expect(Object.isFrozen(access.allCharacterIds)).toBe(true);
    expect(Object.isFrozen(access.corporationIds)).toBe(true);
    expect(Object.isFrozen(access.characterIdsByCorporation)).toBe(true);
    expect(Object.isFrozen(access.characterIdsByCorporation[2000])).toBe(true);
  });
});

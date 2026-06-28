import { describe, expect, it } from 'vitest';
import { type CorpDirectorCandidate, dedupeCorpDirectors } from './director-resolution';

const candidate = (
  corporationId: number,
  vendingCharacterId: number,
  hasRole: boolean,
): CorpDirectorCandidate => ({
  corporationId,
  vendingCharacterId,
  accessToken: `token-${vendingCharacterId}`,
  hasRole,
});

describe('dedupeCorpDirectors', () => {
  it('returns one subject per corporation', () => {
    const out = dedupeCorpDirectors([candidate(1, 10, false), candidate(1, 11, false), candidate(2, 20, true)]);
    expect(out.map((c) => c.corporationId).sort()).toEqual([1, 2]);
  });

  it('prefers a role-holder as the vending character', () => {
    const out = dedupeCorpDirectors([candidate(1, 10, false), candidate(1, 11, true)]);
    const subject = out.find((c) => c.corporationId === 1);
    expect(subject?.vendingCharacterId).toBe(11);
    expect(subject?.hasRole).toBe(true);
  });

  it('keeps the first role-holder when several hold the role (stable choice)', () => {
    const out = dedupeCorpDirectors([candidate(1, 11, true), candidate(1, 12, true)]);
    expect(out.find((c) => c.corporationId === 1)?.vendingCharacterId).toBe(11);
  });

  it('returns a non-role subject when no member holds the role (the needs-role case)', () => {
    const out = dedupeCorpDirectors([candidate(1, 10, false)]);
    expect(out[0]?.hasRole).toBe(false);
  });
});

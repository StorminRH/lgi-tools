import { describe, expect, it } from 'vitest';
import { classifyCorpDirector } from './director';
import type { CorpMemberCandidate } from './types';

const candidate = (vendingCharacterId: number, hasRole: boolean): CorpMemberCandidate => ({
  vendingCharacterId,
  accessToken: `tok-${vendingCharacterId}`,
  hasRole,
});

describe('classifyCorpDirector', () => {
  it('is unavailable when no member could be vended', () => {
    expect(classifyCorpDirector([])).toEqual({ kind: 'unavailable' });
  });

  it('is needs_role when members vended but none holds the role', () => {
    expect(classifyCorpDirector([candidate(10, false), candidate(11, false)])).toEqual({ kind: 'needs_role' });
  });

  it('returns the first role-holder token (stable choice)', () => {
    expect(classifyCorpDirector([candidate(10, false), candidate(11, true), candidate(12, true)])).toEqual({
      kind: 'token',
      vendingCharacterId: 11,
      accessToken: 'tok-11',
    });
  });
});

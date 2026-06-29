import { describe, expect, it } from 'vitest';
import { type CorpMemberCandidate, resolveCorpDirector } from './corp-director-resolution';

function candidate(overrides: Partial<CorpMemberCandidate> = {}): CorpMemberCandidate {
  return { vendingCharacterId: 1, accessToken: 'tok-1', hasRole: true, ...overrides };
}

describe('resolveCorpDirector', () => {
  it('is unavailable when no member could be vended', () => {
    expect(resolveCorpDirector([])).toEqual({ kind: 'unavailable' });
  });

  it('is needs_role when members vended but none holds the role', () => {
    const result = resolveCorpDirector([
      candidate({ vendingCharacterId: 1, hasRole: false }),
      candidate({ vendingCharacterId: 2, hasRole: false }),
    ]);
    expect(result).toEqual({ kind: 'needs_role' });
  });

  it('returns the first role-holder token (stable choice)', () => {
    const result = resolveCorpDirector([
      candidate({ vendingCharacterId: 1, accessToken: 'tok-1', hasRole: false }),
      candidate({ vendingCharacterId: 2, accessToken: 'tok-2', hasRole: true }),
      candidate({ vendingCharacterId: 3, accessToken: 'tok-3', hasRole: true }),
    ]);
    expect(result).toEqual({ kind: 'token', vendingCharacterId: 2, accessToken: 'tok-2' });
  });

  it('prefers a role-holder even when a non-role-holder is listed first', () => {
    const result = resolveCorpDirector([
      candidate({ vendingCharacterId: 9, accessToken: 'no-role', hasRole: false }),
      candidate({ vendingCharacterId: 4, accessToken: 'yes-role', hasRole: true }),
    ]);
    expect(result).toEqual({ kind: 'token', vendingCharacterId: 4, accessToken: 'yes-role' });
  });
});

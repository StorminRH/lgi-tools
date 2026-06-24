import { describe, expect, it } from 'vitest';
import { toPanelCharacter } from './panel-character';

const base = { characterId: 90001, name: 'Pilot Alpha', portraitUrl: 'https://img/1.jpg' };

describe('toPanelCharacter', () => {
  it('projects only the client-safe fields (never the granted scope)', () => {
    const panel = toPanelCharacter(
      { ...base, scope: 'esi-skills.read_skills.v1', hasRefreshToken: true },
      () => true,
    );
    expect(panel).toEqual({
      characterId: 90001,
      name: 'Pilot Alpha',
      portraitUrl: 'https://img/1.jpg',
      needsReconnect: false,
    });
    expect(panel).not.toHaveProperty('scope');
  });

  it('sets needsReconnect to the negation of the tracker predicate', () => {
    const syncable = { ...base, scope: '', hasRefreshToken: true };
    expect(toPanelCharacter(syncable, () => true).needsReconnect).toBe(false);
    expect(toPanelCharacter(syncable, () => false).needsReconnect).toBe(true);
  });

  it('hands the predicate the token state and the derived missing scopes', () => {
    let seen: { hasRefreshToken: boolean; missingScopes: string[] } | undefined;
    toPanelCharacter({ ...base, scope: '', hasRefreshToken: false }, (eligibility) => {
      seen = eligibility;
      return eligibility.hasRefreshToken;
    });
    expect(seen?.hasRefreshToken).toBe(false);
    // An empty granted scope → the whole required superset comes back missing.
    expect(seen?.missingScopes.length ?? 0).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import { EVE_SCOPES } from '@/features/auth/eve-sso';
import type { LinkedCharacter } from '@/features/auth/queries';
import { deriveAbsorbedCharacter, deriveCharacterRowView } from './characters-view';

const character = (over: Partial<LinkedCharacter> = {}): LinkedCharacter => ({
  characterId: 1,
  name: 'Pilot',
  portraitUrl: '',
  scope: null,
  hasRefreshToken: true,
  linkedAt: new Date(0),
  corporationId: null,
  affiliationRefreshedAt: null,
  ...over,
});

describe('deriveCharacterRowView', () => {
  it('reports a healthy character with no reconnect label and the granted scopes', () => {
    const view = deriveCharacterRowView({ scope: EVE_SCOPES.join(','), hasRefreshToken: true });
    expect(view.needsReconnect).toBe(false);
    expect(view.healthLabel).toBeNull();
    expect(view.scopes.length).toBeGreaterThan(0);
  });

  it('labels a token-less character Disconnected', () => {
    const view = deriveCharacterRowView({ scope: EVE_SCOPES.join(','), hasRefreshToken: false });
    expect(view.needsReconnect).toBe(true);
    expect(view.healthLabel).toBe('Disconnected');
  });

  it('labels a scope-short character Missing scopes when a token is present', () => {
    const view = deriveCharacterRowView({ scope: 'publicData', hasRefreshToken: true });
    expect(view.needsReconnect).toBe(true);
    expect(view.healthLabel).toBe('Missing scopes');
  });
});

describe('deriveAbsorbedCharacter', () => {
  it('resolves the absorbed character by id from the roster', () => {
    const roster = [character({ characterId: 1 }), character({ characterId: 2, name: 'Alt' })];
    expect(deriveAbsorbedCharacter('2', roster)?.name).toBe('Alt');
  });

  it('returns undefined for a non-string param', () => {
    expect(deriveAbsorbedCharacter(undefined, [character()])).toBeUndefined();
    expect(deriveAbsorbedCharacter(['1', '2'], [character()])).toBeUndefined();
  });

  it('returns undefined for an id not present in the roster', () => {
    expect(deriveAbsorbedCharacter('999', [character({ characterId: 1 })])).toBeUndefined();
  });
});

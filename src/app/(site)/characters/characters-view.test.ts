import { expect, test } from 'vitest';
import { EVE_SCOPES } from '@/platform/auth/eve-sso-constants';
import type { LinkedCharacter } from '@/platform/auth/linked-characters';
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

test('deriveCharacterRowView reports healthy, disconnected, and missing-scope reconnect labels', () => {
  const healthy = deriveCharacterRowView({
    scope: [...EVE_SCOPES].reverse().join(','),
    hasRefreshToken: true,
  });
  expect(healthy.needsReconnect).toBe(false);
  expect(healthy.healthLabel).toBeNull();
  expect(healthy.scopes.length).toBeGreaterThan(0);

  const disconnected = deriveCharacterRowView({
    scope: 'publicData',
    hasRefreshToken: false,
  });
  expect(disconnected.needsReconnect).toBe(true);
  expect(disconnected.healthLabel).toBe('Disconnected');

  const missingScopes = deriveCharacterRowView({
    scope: 'publicData',
    hasRefreshToken: true,
  });
  expect(missingScopes.needsReconnect).toBe(true);
  expect(missingScopes.healthLabel).toBe('Missing scopes');
});

test('deriveAbsorbedCharacter resolves roster ids and rejects invalid params', () => {
  const roster = [character({ characterId: 1 }), character({ characterId: 2, name: 'Alt' })];
  expect(deriveAbsorbedCharacter('2', roster)?.name).toBe('Alt');
  expect(deriveAbsorbedCharacter(undefined, [character()])).toBeUndefined();
  expect(deriveAbsorbedCharacter(['1', '2'], [character()])).toBeUndefined();
  expect(deriveAbsorbedCharacter('999', [character({ characterId: 1 })])).toBeUndefined();
});

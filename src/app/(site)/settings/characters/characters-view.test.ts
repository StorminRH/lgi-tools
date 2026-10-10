import { expect, test } from 'vitest';
import { EVE_SCOPES } from '@/config/eve-scopes';
import { deriveCharacterRowView } from './characters-view';

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

test('delayed verification does not request reconnect and clears when authorization recovers', () => {
  const character = { scope: EVE_SCOPES.join(' '), hasRefreshToken: true };
  expect(deriveCharacterRowView({ ...character, authorizationDelayed: true })).toMatchObject({
    needsReconnect: false,
    healthLabel: 'Verification delayed',
    authorizationDelayed: true,
  });
  expect(deriveCharacterRowView({ ...character, authorizationDelayed: false })).toMatchObject({
    needsReconnect: false,
    healthLabel: null,
    authorizationDelayed: false,
  });
  expect(deriveCharacterRowView({ ...character, authorizationDelayed: true, hasRefreshToken: false })).toMatchObject({
    needsReconnect: true,
    healthLabel: 'Disconnected',
    authorizationDelayed: false,
  });
});

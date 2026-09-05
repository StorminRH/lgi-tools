import { expect, test } from 'vitest';
import { canSyncLocation, LOCATION_SYNC_SCOPES } from './sync-eligibility';

test('canSyncLocation accepts covered tokens and rejects missing scopes or dead tokens', () => {
  expect([...LOCATION_SYNC_SCOPES]).toEqual([
    'esi-location.read_location.v1',
    'esi-location.read_ship_type.v1',
    'esi-location.read_online.v1',
  ]);
  expect(canSyncLocation({ hasRefreshToken: true, missingScopes: [] })).toBe(true);
  expect(
    canSyncLocation({
      hasRefreshToken: true,
      missingScopes: ['esi-skills.read_skills.v1'],
    }),
  ).toBe(true);
  expect(
    canSyncLocation({
      hasRefreshToken: true,
      missingScopes: ['esi-location.read_location.v1'],
    }),
  ).toBe(false);
  expect(
    canSyncLocation({
      hasRefreshToken: true,
      missingScopes: ['esi-location.read_ship_type.v1'],
    }),
  ).toBe(false);
  expect(canSyncLocation({ hasRefreshToken: false, missingScopes: [] })).toBe(false);
});

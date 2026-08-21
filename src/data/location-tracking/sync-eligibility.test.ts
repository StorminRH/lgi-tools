import { expect, test } from 'vitest';
import { canSyncLocation, LOCATION_SYNC_SCOPES } from './__tests__/sync-eligibility';

test('LOCATION_SYNC_SCOPES pins verified location and ship-type scopes', () => {
  // These exact strings are pinned ∈ EVE_SCOPES by the auth feature's own pin
  // test (eve-sso.test.ts) — together the two tests guarantee the sync never
  // demands a scope sign-in doesn't request.
  expect([...LOCATION_SYNC_SCOPES]).toEqual([
    'esi-location.read_location.v1',
    'esi-location.read_ship_type.v1',
    'esi-location.read_online.v1',
  ]);
});

test('canSyncLocation accepts covered tokens and rejects missing scopes or dead tokens', () => {
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

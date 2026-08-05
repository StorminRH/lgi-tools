import { describe, expect, it } from 'vitest';
import { canSyncLocation, LOCATION_SYNC_SCOPES } from './sync-eligibility';

describe('LOCATION_SYNC_SCOPES', () => {
  it('pins the verified location and ship-type scope strings', () => {
    // These exact strings are pinned ∈ EVE_SCOPES by the auth feature's own pin
    // test (eve-sso.test.ts) — together the two tests guarantee the sync never
    // demands a scope sign-in doesn't request. (A direct EVE_SCOPES import here
    // would be a feature → feature edge the boundary lint bans.)
    expect([...LOCATION_SYNC_SCOPES]).toEqual([
      'esi-location.read_location.v1',
      'esi-location.read_ship_type.v1',
    ]);
  });
});

describe('canSyncLocation', () => {
  it('accepts a character with a token and both location scopes', () => {
    expect(canSyncLocation({ hasRefreshToken: true, missingScopes: [] })).toBe(true);
  });

  it('accepts a character missing only NON-location superset scopes', () => {
    // The old-consent case: missing an unrelated scope but still covering
    // location + ship — the sitewide health says reconnect, location sync works.
    expect(
      canSyncLocation({
        hasRefreshToken: true,
        missingScopes: ['esi-skills.read_skills.v1'],
      }),
    ).toBe(true);
  });

  it('rejects a character missing the location scope', () => {
    expect(
      canSyncLocation({
        hasRefreshToken: true,
        missingScopes: ['esi-location.read_location.v1'],
      }),
    ).toBe(false);
  });

  it('rejects a character missing the ship-type scope', () => {
    expect(
      canSyncLocation({
        hasRefreshToken: true,
        missingScopes: ['esi-location.read_ship_type.v1'],
      }),
    ).toBe(false);
  });

  it('rejects a character with a dead refresh token', () => {
    expect(canSyncLocation({ hasRefreshToken: false, missingScopes: [] })).toBe(false);
  });
});

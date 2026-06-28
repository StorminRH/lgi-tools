import { describe, expect, it } from 'vitest';
import { canSyncOnline, ONLINE_SYNC_SCOPES } from './sync-eligibility';

describe('ONLINE_SYNC_SCOPES', () => {
  it('pins the verified online scope string', () => {
    // This exact string is pinned ∈ EVE_SCOPES by the auth feature's own pin
    // test (eve-sso.test.ts) — together the two tests guarantee the sync never
    // demands a scope sign-in doesn't request. (A direct EVE_SCOPES import here
    // would be a feature → feature edge the boundary lint bans.)
    expect([...ONLINE_SYNC_SCOPES]).toEqual(['esi-location.read_online.v1']);
  });
});

describe('canSyncOnline', () => {
  it('accepts a character with a token and the online scope', () => {
    expect(canSyncOnline({ hasRefreshToken: true, missingScopes: [] })).toBe(true);
  });

  it('accepts a character missing only NON-online superset scopes', () => {
    // The old-consent case: missing an unrelated scope but still covering online —
    // the sitewide health says reconnect, the online sync works.
    expect(
      canSyncOnline({
        hasRefreshToken: true,
        missingScopes: ['esi-skills.read_skills.v1'],
      }),
    ).toBe(true);
  });

  it('rejects a character missing the online scope', () => {
    expect(
      canSyncOnline({
        hasRefreshToken: true,
        missingScopes: ['esi-location.read_online.v1'],
      }),
    ).toBe(false);
  });

  it('rejects a character with a dead refresh token', () => {
    expect(canSyncOnline({ hasRefreshToken: false, missingScopes: [] })).toBe(false);
  });
});

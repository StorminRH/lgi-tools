import { describe, expect, it } from 'vitest';
import { ASSETS_SYNC_SCOPES, canSyncAssets } from './sync-eligibility';

describe('ASSETS_SYNC_SCOPES', () => {
  it('pins the verified character assets scope string', () => {
    // This exact string is pinned ∈ EVE_SCOPES by the auth feature's own pin test
    // (eve-sso.test.ts) — together the two tests guarantee the sync never demands
    // a scope sign-in doesn't request. (A direct EVE_SCOPES import here would be a
    // feature → feature edge the boundary lint bans.)
    expect([...ASSETS_SYNC_SCOPES]).toEqual(['esi-assets.read_assets.v1']);
  });

  it('requests only read-only scopes', () => {
    for (const scope of ASSETS_SYNC_SCOPES) {
      expect(/\.read_/.test(scope), `${scope} is not a read-only scope`).toBe(true);
    }
  });
});

describe('canSyncAssets', () => {
  it('accepts a character with a token and the assets scope', () => {
    expect(canSyncAssets({ hasRefreshToken: true, missingScopes: [] })).toBe(true);
  });

  it('accepts a character missing only unrelated superset scopes', () => {
    expect(
      canSyncAssets({
        hasRefreshToken: true,
        missingScopes: ['esi-skills.read_skills.v1'],
      }),
    ).toBe(true);
  });

  it('rejects a character missing the assets scope', () => {
    expect(
      canSyncAssets({
        hasRefreshToken: true,
        missingScopes: ['esi-assets.read_assets.v1'],
      }),
    ).toBe(false);
  });

  it('rejects a character without a refresh token', () => {
    expect(canSyncAssets({ hasRefreshToken: false, missingScopes: [] })).toBe(false);
  });
});

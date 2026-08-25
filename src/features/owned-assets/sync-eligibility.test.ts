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
});

describe('canSyncAssets', () => {
  it.each([
    [{ hasRefreshToken: true, missingScopes: [] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-skills.read_skills.v1'] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-assets.read_assets.v1'] }, false],
    [{ hasRefreshToken: false, missingScopes: [] }, false],
  ])('token + required scope: %j → %s', (input, expected) => {
    expect(canSyncAssets(input)).toBe(expected);
  });
});

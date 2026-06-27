import { describe, expect, it } from 'vitest';
import { BLUEPRINTS_SYNC_SCOPES, canSyncBlueprints } from './sync-eligibility';

describe('BLUEPRINTS_SYNC_SCOPES', () => {
  it('pins the verified character blueprints scope string', () => {
    // This exact string is pinned ∈ EVE_SCOPES by the auth feature's own pin test
    // (eve-sso.test.ts) — together the two tests guarantee the sync never demands
    // a scope sign-in doesn't request. (A direct EVE_SCOPES import here would be a
    // feature → feature edge the boundary lint bans.)
    expect([...BLUEPRINTS_SYNC_SCOPES]).toEqual(['esi-characters.read_blueprints.v1']);
  });

  it('requests only read-only scopes', () => {
    for (const scope of BLUEPRINTS_SYNC_SCOPES) {
      expect(/\.read_/.test(scope), `${scope} is not a read-only scope`).toBe(true);
    }
  });
});

describe('canSyncBlueprints', () => {
  it('accepts a character with a token and the blueprints scope', () => {
    expect(canSyncBlueprints({ hasRefreshToken: true, missingScopes: [] })).toBe(true);
  });

  it('accepts a character missing only unrelated superset scopes', () => {
    expect(
      canSyncBlueprints({
        hasRefreshToken: true,
        missingScopes: ['esi-skills.read_skills.v1'],
      }),
    ).toBe(true);
  });

  it('rejects a character missing the blueprints scope', () => {
    expect(
      canSyncBlueprints({
        hasRefreshToken: true,
        missingScopes: ['esi-characters.read_blueprints.v1'],
      }),
    ).toBe(false);
  });

  it('rejects a character without a refresh token', () => {
    expect(canSyncBlueprints({ hasRefreshToken: false, missingScopes: [] })).toBe(false);
  });
});

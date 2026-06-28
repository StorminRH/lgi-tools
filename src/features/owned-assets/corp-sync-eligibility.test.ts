import { describe, expect, it } from 'vitest';
import {
  canSyncCorpAssets,
  CORP_ASSETS_REQUIRED_ROLES,
  CORP_ASSETS_SYNC_SCOPES,
} from './corp-sync-eligibility';

describe('CORP_ASSETS_SYNC_SCOPES', () => {
  it('pins the verified corp assets scope strings', () => {
    // These exact strings are pinned ∈ EVE_SCOPES by eve-sso.test.ts. The roles
    // read is shared with corp industry jobs + corp blueprints; the corp-assets
    // read lives under `esi-assets`, NOT `esi-corporations`.
    expect([...CORP_ASSETS_SYNC_SCOPES]).toEqual([
      'esi-characters.read_corporation_roles.v1',
      'esi-assets.read_corporation_assets.v1',
    ]);
  });

  it('requests only read-only scopes', () => {
    for (const scope of CORP_ASSETS_SYNC_SCOPES) {
      expect(/\.read_/.test(scope), `${scope} is not a read-only scope`).toBe(true);
    }
  });
});

describe('CORP_ASSETS_REQUIRED_ROLES', () => {
  it('pins Director as the sole admitting role', () => {
    expect([...CORP_ASSETS_REQUIRED_ROLES]).toEqual(['Director']);
  });
});

describe('canSyncCorpAssets', () => {
  it('accepts a character with a token and both corp scopes', () => {
    expect(canSyncCorpAssets({ hasRefreshToken: true, missingScopes: [] })).toBe(true);
  });

  it('accepts a character missing only unrelated superset scopes', () => {
    expect(
      canSyncCorpAssets({
        hasRefreshToken: true,
        missingScopes: ['esi-skills.read_skills.v1'],
      }),
    ).toBe(true);
  });

  it('rejects a character missing the corp roles scope', () => {
    expect(
      canSyncCorpAssets({
        hasRefreshToken: true,
        missingScopes: ['esi-characters.read_corporation_roles.v1'],
      }),
    ).toBe(false);
  });

  it('rejects a character missing the corp-assets scope', () => {
    expect(
      canSyncCorpAssets({
        hasRefreshToken: true,
        missingScopes: ['esi-assets.read_corporation_assets.v1'],
      }),
    ).toBe(false);
  });

  it('rejects a character without a refresh token', () => {
    expect(canSyncCorpAssets({ hasRefreshToken: false, missingScopes: [] })).toBe(false);
  });
});

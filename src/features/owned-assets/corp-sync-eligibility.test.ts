import { describe, expect, it } from 'vitest';
import {
  canSyncCorpAssets,
  CORP_ASSETS_REQUIRED_ROLES,
  CORP_ASSETS_SYNC_SCOPES,
} from './corp-sync-eligibility';

describe('CORP_ASSETS_SYNC_SCOPES', () => {
  it('pins the verified corp assets scopes and Director as the sole admitting role', () => {
    // These exact strings are pinned ∈ EVE_SCOPES by eve-sso.test.ts. The roles
    // read is shared with corp industry jobs + corp blueprints; the corp-assets
    // read lives under `esi-assets`, NOT `esi-corporations`.
    expect([...CORP_ASSETS_SYNC_SCOPES]).toEqual([
      'esi-characters.read_corporation_roles.v1',
      'esi-assets.read_corporation_assets.v1',
    ]);
    expect([...CORP_ASSETS_REQUIRED_ROLES]).toEqual(['Director']);
  });
});

describe('canSyncCorpAssets', () => {
  it.each([
    [{ hasRefreshToken: true, missingScopes: [] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-skills.read_skills.v1'] }, true],
    [
      { hasRefreshToken: true, missingScopes: ['esi-characters.read_corporation_roles.v1'] },
      false,
    ],
    [{ hasRefreshToken: true, missingScopes: ['esi-assets.read_corporation_assets.v1'] }, false],
    [{ hasRefreshToken: false, missingScopes: [] }, false],
  ])('token + both corp scopes: %j → %s', (input, expected) => {
    expect(canSyncCorpAssets(input)).toBe(expected);
  });
});

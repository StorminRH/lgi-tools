import { describe, expect, it } from 'vitest';
import { canSyncCorpAssets, CORP_ASSETS_REQUIRED_ROLES } from './corp-sync-eligibility';

describe('CORP_ASSETS_REQUIRED_ROLES', () => {
  it('pins Director as the sole admitting role', () => {
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

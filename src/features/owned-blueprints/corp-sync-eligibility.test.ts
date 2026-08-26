import { describe, expect, it } from 'vitest';
import {
  canSyncCorpBlueprints,
  CORP_BLUEPRINTS_REQUIRED_ROLES,
  CORP_BLUEPRINTS_SYNC_SCOPES,
} from './corp-sync-eligibility';

describe('CORP_BLUEPRINTS_SYNC_SCOPES', () => {
  it('pins the verified corp blueprints scopes and Director as the sole admitting role', () => {

    expect([...CORP_BLUEPRINTS_SYNC_SCOPES]).toEqual([
      'esi-characters.read_corporation_roles.v1',
      'esi-corporations.read_blueprints.v1',
    ]);
    expect([...CORP_BLUEPRINTS_REQUIRED_ROLES]).toEqual(['Director']);
  });
});

describe('canSyncCorpBlueprints', () => {
  it.each([
    [{ hasRefreshToken: true, missingScopes: [] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-skills.read_skills.v1'] }, true],
    [
      { hasRefreshToken: true, missingScopes: ['esi-characters.read_corporation_roles.v1'] },
      false,
    ],
    [{ hasRefreshToken: true, missingScopes: ['esi-corporations.read_blueprints.v1'] }, false],
    [{ hasRefreshToken: false, missingScopes: [] }, false],
  ])('token + both corp scopes: %j → %s', (input, expected) => {
    expect(canSyncCorpBlueprints(input)).toBe(expected);
  });
});

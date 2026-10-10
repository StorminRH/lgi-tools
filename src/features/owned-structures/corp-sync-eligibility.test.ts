import { describe, expect, it } from 'vitest';
import { canSyncCorpStructures, CORP_STRUCTURES_REQUIRED_ROLES } from './corp-sync-eligibility';

describe('CORP_STRUCTURES_REQUIRED_ROLES', () => {
  it('pins Station_Manager and Director as the admitting roles on the refresh layer', () => {
    expect([...CORP_STRUCTURES_REQUIRED_ROLES]).toEqual(['Station_Manager', 'Director']);
  });
});

describe('canSyncCorpStructures', () => {
  it.each([
    [{ hasRefreshToken: true, missingScopes: [] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-skills.read_skills.v1'] }, true],
    [
      { hasRefreshToken: true, missingScopes: ['esi-characters.read_corporation_roles.v1'] },
      false,
    ],
    [{ hasRefreshToken: true, missingScopes: ['esi-corporations.read_structures.v1'] }, false],
    [{ hasRefreshToken: false, missingScopes: [] }, false],
  ])('token + both corp scopes: %j → %s', (input, expected) => {
    expect(canSyncCorpStructures(input)).toBe(expected);
  });
});

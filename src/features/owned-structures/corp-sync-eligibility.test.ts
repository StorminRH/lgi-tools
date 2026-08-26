import { describe, expect, it } from 'vitest';
import {
  canSyncCorpStructures,
  CORP_STRUCTURES_REQUIRED_ROLES,
  CORP_STRUCTURES_SYNC_SCOPES,
} from './corp-sync-eligibility';

describe('canSyncCorpStructures', () => {
  it.each([
    [{ hasRefreshToken: true, missingScopes: [] }, true],
    [{ hasRefreshToken: false, missingScopes: [] }, false],
  ])('token required: %j → %s', (input, expected) => {
    expect(canSyncCorpStructures(input)).toBe(expected);
  });

  it('rejects a missing roles or structures scope, and pins Station_Manager on the refresh layer', () => {
    for (const scope of CORP_STRUCTURES_SYNC_SCOPES) {
      expect(canSyncCorpStructures({ hasRefreshToken: true, missingScopes: [scope] })).toBe(false);
    }

    expect([...CORP_STRUCTURES_SYNC_SCOPES]).toEqual([
      'esi-characters.read_corporation_roles.v1',
      'esi-corporations.read_structures.v1',
    ]);
    expect([...CORP_STRUCTURES_REQUIRED_ROLES]).toEqual(['Station_Manager']);
  });
});

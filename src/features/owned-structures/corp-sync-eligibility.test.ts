import { describe, expect, it } from 'vitest';
import {
  canSyncCorpStructures,
  CORP_STRUCTURES_REQUIRED_ROLES,
  CORP_STRUCTURES_SYNC_SCOPES,
} from './corp-sync-eligibility';

describe('canSyncCorpStructures', () => {
  it('admits a member with a refresh token and both corp-structures sync scopes', () => {
    expect(canSyncCorpStructures({ hasRefreshToken: true, missingScopes: [] })).toBe(true);
  });

  it('rejects a member without a refresh token (the reconnect path)', () => {
    expect(canSyncCorpStructures({ hasRefreshToken: false, missingScopes: [] })).toBe(false);
  });

  it('rejects a member missing either corp-structures sync scope', () => {
    for (const scope of CORP_STRUCTURES_SYNC_SCOPES) {
      expect(canSyncCorpStructures({ hasRefreshToken: true, missingScopes: [scope] })).toBe(false);
    }
  });

  it('gates the read on the roles read + the structures read, NOT the role itself', () => {
    // The in-game Station_Manager ROLE is gated in the refresh layer (a graceful
    // skip), never here — only scope membership belongs in this predicate.
    expect([...CORP_STRUCTURES_SYNC_SCOPES]).toEqual([
      'esi-characters.read_corporation_roles.v1',
      'esi-corporations.read_structures.v1',
    ]);
    expect([...CORP_STRUCTURES_REQUIRED_ROLES]).toEqual(['Station_Manager']);
  });
});

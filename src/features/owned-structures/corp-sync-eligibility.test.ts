import { expect, test } from 'vitest';
import { EVE_SCOPES } from '@/config/eve-scopes';
import { canSyncCorpStructures, CORP_STRUCTURES_REQUIRED_ROLES } from './corp-sync-eligibility';

const NEEDED: readonly string[] = [
  'esi-characters.read_corporation_roles.v1',
  'esi-corporations.read_structures.v1',
];

test('CORP_STRUCTURES_REQUIRED_ROLES pins Station_Manager and Director as the admitting roles on the refresh layer', () => {
  expect([...CORP_STRUCTURES_REQUIRED_ROLES]).toEqual(['Station_Manager', 'Director']);
});

test('canSyncCorpStructures needs the roles and corporation structures scopes and no other', () => {
  for (const scope of NEEDED) {
    expect(canSyncCorpStructures({ hasRefreshToken: true, missingScopes: [scope] }), scope).toBe(false);
  }
  const others = EVE_SCOPES.filter((scope) => !NEEDED.includes(scope));
  expect(canSyncCorpStructures({ hasRefreshToken: true, missingScopes: others })).toBe(true);
});

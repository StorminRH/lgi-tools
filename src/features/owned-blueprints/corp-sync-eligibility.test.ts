import { expect, test } from 'vitest';
import { EVE_SCOPES } from '@/config/eve-scopes';
import { canSyncCorpBlueprints, CORP_BLUEPRINTS_REQUIRED_ROLES } from './corp-sync-eligibility';

const NEEDED: readonly string[] = [
  'esi-characters.read_corporation_roles.v1',
  'esi-corporations.read_blueprints.v1',
];

test('CORP_BLUEPRINTS_REQUIRED_ROLES pins Director as the sole admitting role', () => {
  expect([...CORP_BLUEPRINTS_REQUIRED_ROLES]).toEqual(['Director']);
});

test('canSyncCorpBlueprints needs the roles and corporation blueprints scopes and no other', () => {
  for (const scope of NEEDED) {
    expect(canSyncCorpBlueprints({ hasRefreshToken: true, missingScopes: [scope] }), scope).toBe(false);
  }
  const others = EVE_SCOPES.filter((scope) => !NEEDED.includes(scope));
  expect(canSyncCorpBlueprints({ hasRefreshToken: true, missingScopes: others })).toBe(true);
});

import { expect, test } from 'vitest';
import { EVE_SCOPES } from '@/config/eve-scopes';
import { canSyncCorpAssets, CORP_ASSETS_REQUIRED_ROLES } from './corp-sync-eligibility';

const NEEDED: readonly string[] = [
  'esi-characters.read_corporation_roles.v1',
  'esi-assets.read_corporation_assets.v1',
];

test('CORP_ASSETS_REQUIRED_ROLES pins Director as the sole admitting role', () => {
  expect([...CORP_ASSETS_REQUIRED_ROLES]).toEqual(['Director']);
});

test('canSyncCorpAssets needs the roles and corporation assets scopes and no other', () => {
  for (const scope of NEEDED) {
    expect(canSyncCorpAssets({ hasRefreshToken: true, missingScopes: [scope] }), scope).toBe(false);
  }
  const others = EVE_SCOPES.filter((scope) => !NEEDED.includes(scope));
  expect(canSyncCorpAssets({ hasRefreshToken: true, missingScopes: others })).toBe(true);
});

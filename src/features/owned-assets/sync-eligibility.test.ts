import { expect, test } from 'vitest';
import { EVE_SCOPES } from '@/config/eve-scopes';
import { canSyncAssets } from './sync-eligibility';

const NEEDED: readonly string[] = ['esi-assets.read_assets.v1'];

test('canSyncAssets needs the character assets scope and no other', () => {
  for (const scope of NEEDED) {
    expect(canSyncAssets({ hasRefreshToken: true, missingScopes: [scope] }), scope).toBe(false);
  }
  const others = EVE_SCOPES.filter((scope) => !NEEDED.includes(scope));
  expect(canSyncAssets({ hasRefreshToken: true, missingScopes: others })).toBe(true);
});

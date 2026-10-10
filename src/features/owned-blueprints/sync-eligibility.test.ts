import { expect, test } from 'vitest';
import { EVE_SCOPES } from '@/config/eve-scopes';
import { canSyncBlueprints } from './sync-eligibility';

const NEEDED: readonly string[] = ['esi-characters.read_blueprints.v1'];

test('canSyncBlueprints needs the character blueprints scope and no other', () => {
  for (const scope of NEEDED) {
    expect(canSyncBlueprints({ hasRefreshToken: true, missingScopes: [scope] }), scope).toBe(false);
  }
  const others = EVE_SCOPES.filter((scope) => !NEEDED.includes(scope));
  expect(canSyncBlueprints({ hasRefreshToken: true, missingScopes: others })).toBe(true);
});

import { expect, test } from 'vitest';
import { canSyncSection } from './sync-eligibility';

test('a section syncs only with a refresh token and every scope it needs', () => {
  expect(canSyncSection('profile', { hasRefreshToken: false, missingScopes: [] })).toBe(false);
  const withToken = (missingScopes: string[]) => ({ hasRefreshToken: true, missingScopes });
  expect(canSyncSection('profile', withToken(['esi-wallet.read_character_wallet.v1']))).toBe(true);

  const missingWallet = withToken(['esi-wallet.read_character_wallet.v1']);
  expect(canSyncSection('wallet', missingWallet)).toBe(false);
  expect(canSyncSection('journal', missingWallet)).toBe(false);
  expect(canSyncSection('clones', missingWallet)).toBe(true);
  expect(canSyncSection('status', missingWallet)).toBe(true);
  expect(canSyncSection('status', withToken(['esi-location.read_online.v1']))).toBe(false);
});

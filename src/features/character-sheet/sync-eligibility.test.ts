import { describe, expect, it } from 'vitest';
import { canSyncSection, SHEET_SECTION_SCOPES } from './sync-eligibility';

describe('SHEET_SECTION_SCOPES', () => {
  it('is derived from the section table, one scope list per section', () => {
    expect(SHEET_SECTION_SCOPES).toEqual({
      profile: [],
      status: ['esi-location.read_location.v1', 'esi-location.read_ship_type.v1', 'esi-location.read_online.v1'],
      attributes: ['esi-skills.read_skills.v1'],
      implants: ['esi-clones.read_implants.v1'],
      clones: ['esi-clones.read_clones.v1'],
      wallet: ['esi-wallet.read_character_wallet.v1'],
      journal: ['esi-wallet.read_character_wallet.v1'],
      structures: ['esi-universe.read_structures.v1'],
    });
  });
});

describe('canSyncSection', () => {
  const withToken = (missingScopes: string[]) => ({ hasRefreshToken: true, missingScopes });

  it('requires a refresh token even for the public profile section', () => {
    expect(canSyncSection('profile', { hasRefreshToken: false, missingScopes: [] })).toBe(false);
    expect(canSyncSection('profile', withToken(['esi-wallet.read_character_wallet.v1']))).toBe(true);
  });

  it('gates each section on its own scopes only', () => {
    const missingWallet = withToken(['esi-wallet.read_character_wallet.v1']);
    expect(canSyncSection('wallet', missingWallet)).toBe(false);
    expect(canSyncSection('journal', missingWallet)).toBe(false);
    expect(canSyncSection('clones', missingWallet)).toBe(true);
    expect(canSyncSection('status', missingWallet)).toBe(true);
  });

  it('denies status when any one of its three location scopes is missing', () => {
    expect(canSyncSection('status', withToken(['esi-location.read_online.v1']))).toBe(false);
  });
});

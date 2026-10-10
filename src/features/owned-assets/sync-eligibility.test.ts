import { describe, expect, it } from 'vitest';
import { canSyncAssets } from './sync-eligibility';

describe('canSyncAssets', () => {
  it.each([
    [{ hasRefreshToken: true, missingScopes: [] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-skills.read_skills.v1'] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-assets.read_assets.v1'] }, false],
    [{ hasRefreshToken: false, missingScopes: [] }, false],
  ])('token + required scope: %j → %s', (input, expected) => {
    expect(canSyncAssets(input)).toBe(expected);
  });
});

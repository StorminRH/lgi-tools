import { describe, expect, it } from 'vitest';
import { canSyncBlueprints } from './sync-eligibility';

describe('canSyncBlueprints', () => {
  it.each([
    [{ hasRefreshToken: true, missingScopes: [] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-skills.read_skills.v1'] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-characters.read_blueprints.v1'] }, false],
    [{ hasRefreshToken: false, missingScopes: [] }, false],
  ])('token + required scope: %j → %s', (input, expected) => {
    expect(canSyncBlueprints(input)).toBe(expected);
  });
});

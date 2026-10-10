import { describe, expect, it } from 'vitest';
import { canSyncSkillQueue } from './sync-eligibility';

describe('canSyncSkillQueue', () => {
  it.each([
    [{ hasRefreshToken: true, missingScopes: [] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-industry.read_character_jobs.v1'] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-skills.read_skills.v1'] }, false],
    [{ hasRefreshToken: true, missingScopes: ['esi-skills.read_skillqueue.v1'] }, false],
    [{ hasRefreshToken: false, missingScopes: [] }, false],
  ])('token + both skill scopes: %j → %s', (input, expected) => {
    expect(canSyncSkillQueue(input)).toBe(expected);
  });
});

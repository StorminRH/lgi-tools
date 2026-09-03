import { describe, expect, it } from 'vitest';
import { canSyncSkillQueue, SKILL_SYNC_SCOPES } from './sync-eligibility';

describe('SKILL_SYNC_SCOPES', () => {
  it('pins the two verified skill scope strings', () => {

    expect([...SKILL_SYNC_SCOPES]).toEqual([
      'esi-skills.read_skills.v1',
      'esi-skills.read_skillqueue.v1',
    ]);
  });
});

describe('canSyncSkillQueue', () => {
  it.each([
    [{ hasRefreshToken: true, missingScopes: [] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-industry.read_character_jobs.v1'] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-skills.read_skillqueue.v1'] }, false],
    [{ hasRefreshToken: false, missingScopes: [] }, false],
  ])('token + both skill scopes: %j → %s', (input, expected) => {
    expect(canSyncSkillQueue(input)).toBe(expected);
  });
});

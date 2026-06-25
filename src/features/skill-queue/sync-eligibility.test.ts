import { describe, expect, it } from 'vitest';
import { canSyncSkillQueue, SKILL_SYNC_SCOPES } from './sync-eligibility';

describe('SKILL_SYNC_SCOPES', () => {
  it('pins the two verified skill scope strings', () => {
    // These exact strings are pinned ∈ EVE_SCOPES by the auth feature's own
    // pin test (eve-sso.test.ts) — together the two tests guarantee the sync
    // never demands a scope sign-in doesn't request. (A direct EVE_SCOPES
    // import here would be a feature → feature edge the boundary lint bans.)
    expect([...SKILL_SYNC_SCOPES]).toEqual([
      'esi-skills.read_skills.v1',
      'esi-skills.read_skillqueue.v1',
    ]);
  });
});

describe('canSyncSkillQueue', () => {
  it('accepts a character with a token and both skill scopes', () => {
    expect(canSyncSkillQueue({ hasRefreshToken: true, missingScopes: [] })).toBe(true);
  });

  it('accepts a character missing only NON-skill superset scopes', () => {
    // The old-consent case: missing an unrelated scope (the industry-jobs read,
    // ∉ SKILL_SYNC_SCOPES) but still covering skills — the sitewide health says
    // reconnect, the skill sync works.
    expect(
      canSyncSkillQueue({
        hasRefreshToken: true,
        missingScopes: ['esi-industry.read_character_jobs.v1'],
      }),
    ).toBe(true);
  });

  it('rejects a character missing a skill scope', () => {
    expect(
      canSyncSkillQueue({
        hasRefreshToken: true,
        missingScopes: ['esi-skills.read_skillqueue.v1'],
      }),
    ).toBe(false);
  });

  it('rejects a character with a dead refresh token', () => {
    expect(canSyncSkillQueue({ hasRefreshToken: false, missingScopes: [] })).toBe(false);
  });
});

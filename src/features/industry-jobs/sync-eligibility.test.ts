import { describe, expect, it } from 'vitest';
import { canSyncIndustryJobs, INDUSTRY_JOBS_SYNC_SCOPES } from './sync-eligibility';

describe('INDUSTRY_JOBS_SYNC_SCOPES', () => {
  it('pins the verified industry-jobs scope string', () => {
    // This exact string is pinned ∈ EVE_SCOPES by the auth feature's own pin
    // test (eve-sso.test.ts) — together the two tests guarantee the sync
    // never demands a scope sign-in doesn't request. (A direct EVE_SCOPES
    // import here would be a feature → feature edge the boundary lint bans.)
    expect([...INDUSTRY_JOBS_SYNC_SCOPES]).toEqual(['esi-industry.read_character_jobs.v1']);
  });
});

describe('canSyncIndustryJobs', () => {
  it('accepts a character with a token and the industry-jobs scope', () => {
    expect(canSyncIndustryJobs({ hasRefreshToken: true, missingScopes: [] })).toBe(true);
  });

  it('accepts a character missing only unrelated superset scopes', () => {
    // The old-consent case: missing an unrelated scope (a skills read, ∉
    // INDUSTRY_JOBS_SYNC_SCOPES) but still covering industry jobs — the sitewide
    // health says reconnect, the industry-jobs sync works.
    expect(
      canSyncIndustryJobs({
        hasRefreshToken: true,
        missingScopes: ['esi-skills.read_skills.v1'],
      }),
    ).toBe(true);
  });

  it('rejects a character missing the industry-jobs scope', () => {
    expect(
      canSyncIndustryJobs({
        hasRefreshToken: true,
        missingScopes: ['esi-industry.read_character_jobs.v1'],
      }),
    ).toBe(false);
  });

  it('rejects a character without a refresh token', () => {
    expect(canSyncIndustryJobs({ hasRefreshToken: false, missingScopes: [] })).toBe(false);
  });
});

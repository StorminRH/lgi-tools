import { describe, expect, it } from 'vitest';
import { canSyncIndustryJobs, INDUSTRY_JOBS_SYNC_SCOPES } from './sync-eligibility';

describe('INDUSTRY_JOBS_SYNC_SCOPES', () => {
  it('pins the verified industry-jobs scope string', () => {

    expect([...INDUSTRY_JOBS_SYNC_SCOPES]).toEqual(['esi-industry.read_character_jobs.v1']);
  });
});

describe('canSyncIndustryJobs', () => {
  it.each([
    [{ hasRefreshToken: true, missingScopes: [] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-skills.read_skills.v1'] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-industry.read_character_jobs.v1'] }, false],
    [{ hasRefreshToken: false, missingScopes: [] }, false],
  ])('token + required scope: %j → %s', (input, expected) => {
    expect(canSyncIndustryJobs(input)).toBe(expected);
  });
});

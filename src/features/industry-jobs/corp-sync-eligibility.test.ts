import { describe, expect, it } from 'vitest';
import {
  canSyncCorpIndustryJobs,
  CORP_INDUSTRY_JOBS_REQUIRED_ROLES,
  CORP_INDUSTRY_JOBS_SYNC_SCOPES,
} from './corp-sync-eligibility';

describe('CORP_INDUSTRY_JOBS_SYNC_SCOPES', () => {
  it('pins the verified corp industry-jobs scopes and Factory_Manager / Director roles', () => {
    // These exact strings are pinned ∈ EVE_SCOPES by the auth feature's own pin
    // test (eve-sso.test.ts) — together the two tests guarantee the sync never
    // demands a scope sign-in doesn't request. (A direct EVE_SCOPES import here
    // would be a feature → feature edge the boundary lint bans.)
    expect([...CORP_INDUSTRY_JOBS_SYNC_SCOPES]).toEqual([
      'esi-characters.read_corporation_roles.v1',
      'esi-industry.read_corporation_jobs.v1',
    ]);
    expect([...CORP_INDUSTRY_JOBS_REQUIRED_ROLES]).toEqual(['Factory_Manager', 'Director']);
  });
});

describe('canSyncCorpIndustryJobs', () => {
  it.each([
    [{ hasRefreshToken: true, missingScopes: [] }, true],
    [{ hasRefreshToken: true, missingScopes: ['esi-skills.read_skills.v1'] }, true],
    [
      { hasRefreshToken: true, missingScopes: ['esi-characters.read_corporation_roles.v1'] },
      false,
    ],
    [{ hasRefreshToken: true, missingScopes: ['esi-industry.read_corporation_jobs.v1'] }, false],
    [{ hasRefreshToken: false, missingScopes: [] }, false],
  ])('token + both corp scopes: %j → %s', (input, expected) => {
    expect(canSyncCorpIndustryJobs(input)).toBe(expected);
  });
});

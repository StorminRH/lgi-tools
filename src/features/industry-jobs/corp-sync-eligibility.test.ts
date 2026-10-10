import { describe, expect, it } from 'vitest';
import {
  canSyncCorpIndustryJobs,
  CORP_INDUSTRY_JOBS_REQUIRED_ROLES,
} from './corp-sync-eligibility';

describe('CORP_INDUSTRY_JOBS_REQUIRED_ROLES', () => {
  it('pins Factory_Manager and Director as the admitting roles', () => {
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

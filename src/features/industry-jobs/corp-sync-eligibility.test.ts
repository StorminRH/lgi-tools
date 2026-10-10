import { expect, test } from 'vitest';
import { EVE_SCOPES } from '@/config/eve-scopes';
import { canSyncCorpIndustryJobs, CORP_INDUSTRY_JOBS_REQUIRED_ROLES } from './corp-sync-eligibility';

const NEEDED: readonly string[] = [
  'esi-characters.read_corporation_roles.v1',
  'esi-industry.read_corporation_jobs.v1',
];

test('CORP_INDUSTRY_JOBS_REQUIRED_ROLES pins Factory_Manager and Director as the admitting roles', () => {
  expect([...CORP_INDUSTRY_JOBS_REQUIRED_ROLES]).toEqual(['Factory_Manager', 'Director']);
});

test('canSyncCorpIndustryJobs needs the roles and corporation jobs scopes and no other', () => {
  for (const scope of NEEDED) {
    expect(canSyncCorpIndustryJobs({ hasRefreshToken: true, missingScopes: [scope] }), scope).toBe(false);
  }
  const others = EVE_SCOPES.filter((scope) => !NEEDED.includes(scope));
  expect(canSyncCorpIndustryJobs({ hasRefreshToken: true, missingScopes: others })).toBe(true);
});

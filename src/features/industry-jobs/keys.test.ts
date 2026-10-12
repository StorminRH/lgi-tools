import { expect, test } from 'vitest';
import { ownerFixture } from '@/platform/owner-sync/__tests__/owner-fixtures';
import { characterJobsKey, corpJobsDueKeys, corpJobsKey, jobsDueKeys } from './keys';
import { CORP_INDUSTRY_JOBS_REQUIRED_ROLES } from './corp-sync-eligibility';

test('a jobs refresh checks the eligible characters\' answers only', () => {
  const owners = [
    ownerFixture(1),
    ownerFixture(2, { hasRefreshToken: false }),
    ownerFixture(3, { missingScopes: ['esi-industry.read_character_jobs.v1'] }),
  ];
  expect(jobsDueKeys(owners)).toEqual([characterJobsKey(1)]);
});

test('a corp jobs refresh checks one answer per corporation an eligible member belongs to, held per user', () => {
  const owners = [
    ownerFixture(1, { corporationId: 5000 }),
    ownerFixture(2, { corporationId: 5000 }),
    ownerFixture(3, { corporationId: 6000, missingScopes: ['esi-industry.read_corporation_jobs.v1'] }),
    ownerFixture(4),
  ];
  expect(corpJobsDueKeys('u1', owners)).toEqual([corpJobsKey('u1', 5000)]);
  expect(CORP_INDUSTRY_JOBS_REQUIRED_ROLES).toContain('Factory_Manager');
});

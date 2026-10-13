import { expect, test } from 'vitest';
import { EVE_SCOPES } from '@/config/eve-scopes';
import { canSyncIndustryJobs } from './sync-eligibility';

const NEEDED: readonly string[] = ['esi-industry.read_character_jobs.v1'];

test('canSyncIndustryJobs needs the character jobs scope and no other', () => {
  for (const scope of NEEDED) {
    expect(canSyncIndustryJobs({ hasRefreshToken: true, missingScopes: [scope] }), scope).toBe(false);
  }
  const others = EVE_SCOPES.filter((scope) => !NEEDED.includes(scope));
  expect(canSyncIndustryJobs({ hasRefreshToken: true, missingScopes: others })).toBe(true);
});

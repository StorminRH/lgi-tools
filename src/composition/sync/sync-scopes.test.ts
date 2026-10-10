import { expect, test } from 'vitest';
import { EVE_SCOPES, type EveScope } from '@/config/eve-scopes';
import { LOCATION_SYNC_SCOPES } from '@/data/location-tracking/sync-eligibility';
import { INDUSTRY_JOBS_SYNC_SCOPES } from '@/features/industry-jobs/sync-eligibility';
import { ASSETS_SYNC_SCOPES } from '@/features/owned-assets/sync-eligibility';
import { SKILL_SYNC_SCOPES } from '@/features/skill-queue/sync-eligibility';

// Every exported sync scope set, in one place: add a new exported *_SYNC_SCOPES
// here. A set private to its module only feeds scopeEligibility, whose EveScope
// parameter checks its membership at compile time, and its sync's tests pin it.
const SYNC_SCOPE_SETS = {
  ASSETS_SYNC_SCOPES,
  INDUSTRY_JOBS_SYNC_SCOPES,
  SKILL_SYNC_SCOPES,
  LOCATION_SYNC_SCOPES,
} satisfies Record<string, readonly EveScope[]>;

test.each(Object.entries(SYNC_SCOPE_SETS))(
  '%s requests only scopes sign-in asks for',
  (name, scopes) => {
    expect(scopes.length, `${name} gates on no scope`).toBeGreaterThan(0);
    for (const scope of scopes) expect(EVE_SCOPES, `${name}: ${scope}`).toContain(scope);
  },
);

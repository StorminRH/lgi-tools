import { expect, test } from 'vitest';
import { EVE_SCOPES, type EveScope } from '@/config/eve-scopes';
import { CORP_CONTEXT_SYNC_SCOPES } from '@/data/corp-holdings/context-sync';
import { LOCATION_SYNC_SCOPES } from '@/data/location-tracking/sync-eligibility';
import { CORP_INDUSTRY_JOBS_SYNC_SCOPES } from '@/features/industry-jobs/corp-sync-eligibility';
import { INDUSTRY_JOBS_SYNC_SCOPES } from '@/features/industry-jobs/sync-eligibility';
import { CORP_ASSETS_SYNC_SCOPES } from '@/features/owned-assets/corp-sync-eligibility';
import { ASSETS_SYNC_SCOPES } from '@/features/owned-assets/sync-eligibility';
import { CORP_BLUEPRINTS_SYNC_SCOPES } from '@/features/owned-blueprints/corp-sync-eligibility';
import { BLUEPRINTS_SYNC_SCOPES } from '@/features/owned-blueprints/sync-eligibility';
import { CORP_STRUCTURES_SYNC_SCOPES } from '@/features/owned-structures/corp-sync-eligibility';
import { SKILL_SYNC_SCOPES } from '@/features/skill-queue/sync-eligibility';

// Every sync's scope set, in one place: add a new *_SYNC_SCOPES here.
const SYNC_SCOPE_SETS = {
  ASSETS_SYNC_SCOPES,
  CORP_ASSETS_SYNC_SCOPES,
  CORP_STRUCTURES_SYNC_SCOPES,
  INDUSTRY_JOBS_SYNC_SCOPES,
  CORP_INDUSTRY_JOBS_SYNC_SCOPES,
  BLUEPRINTS_SYNC_SCOPES,
  CORP_BLUEPRINTS_SYNC_SCOPES,
  SKILL_SYNC_SCOPES,
  LOCATION_SYNC_SCOPES,
  CORP_CONTEXT_SYNC_SCOPES,
} satisfies Record<string, readonly EveScope[]>;

test.each(Object.entries(SYNC_SCOPE_SETS))(
  '%s requests only scopes sign-in asks for',
  (name, scopes) => {
    expect(scopes.length, `${name} gates on no scope`).toBeGreaterThan(0);
    for (const scope of scopes) expect(EVE_SCOPES, `${name}: ${scope}`).toContain(scope);
  },
);

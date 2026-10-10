import type { EveScope } from '@/config/eve-scopes';
import { scopeEligibility } from '@/lib/scope-eligibility';

export const INDUSTRY_JOBS_SYNC_SCOPES = [
  'esi-industry.read_character_jobs.v1',
] as const satisfies readonly EveScope[];

export const canSyncIndustryJobs = scopeEligibility(INDUSTRY_JOBS_SYNC_SCOPES);

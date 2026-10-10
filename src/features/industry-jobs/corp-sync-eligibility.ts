import type { EveScope } from '@/config/eve-scopes';
import { scopeEligibility } from '@/lib/scope-eligibility';

const CORP_INDUSTRY_JOBS_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-industry.read_corporation_jobs.v1',
] as const satisfies readonly EveScope[];

export const CORP_INDUSTRY_JOBS_REQUIRED_ROLES = ['Factory_Manager', 'Director'] as const;

export const canSyncCorpIndustryJobs = scopeEligibility(CORP_INDUSTRY_JOBS_SYNC_SCOPES);

export const CORP_INDUSTRY_JOBS_SYNC_SCOPES = [
  'esi-characters.read_corporation_roles.v1',
  'esi-industry.read_corporation_jobs.v1',
] as const;

export const CORP_INDUSTRY_JOBS_REQUIRED_ROLES = ['Factory_Manager', 'Director'] as const;

export function canSyncCorpIndustryJobs(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !CORP_INDUSTRY_JOBS_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}

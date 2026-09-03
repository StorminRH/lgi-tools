export const INDUSTRY_JOBS_SYNC_SCOPES = ['esi-industry.read_character_jobs.v1'] as const;

export function canSyncIndustryJobs(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !INDUSTRY_JOBS_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}

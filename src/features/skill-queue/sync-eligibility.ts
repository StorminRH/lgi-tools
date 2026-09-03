export const SKILL_SYNC_SCOPES = [
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
] as const;

export function canSyncSkillQueue(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !SKILL_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}

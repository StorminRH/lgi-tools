import type { EveScope } from '@/config/eve-scopes';

export const SKILL_SYNC_SCOPES = [
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
] as const satisfies readonly EveScope[];

export function canSyncSkillQueue(character: {
  hasRefreshToken: boolean;
  missingScopes: string[];
}): boolean {
  if (!character.hasRefreshToken) return false;
  return !SKILL_SYNC_SCOPES.some((scope) => character.missingScopes.includes(scope));
}

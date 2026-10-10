import type { EveScope } from '@/config/eve-scopes';
import { scopeEligibility } from '@/lib/scope-eligibility';

export const SKILL_SYNC_SCOPES = [
  'esi-skills.read_skills.v1',
  'esi-skills.read_skillqueue.v1',
] as const satisfies readonly EveScope[];

export const canSyncSkillQueue = scopeEligibility(SKILL_SYNC_SCOPES);

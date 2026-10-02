import { getSkillLevelsForUserOnView } from '@/composition/sync/skills-sync';
import { getCurrentUserId } from '@/composition/session';
import { industrySlotsEndpoint } from '@/features/industry-jobs/api-contract';
import { SLOT_SKILLS, slotCapacity } from '@/features/industry-jobs/slots';
import {
  ADVANCED_INDUSTRY_SKILL_ID,
  INDUSTRY_SKILL_ID,
  REACTIONS_SKILL_ID,
} from '@/features/industry-planner/skill-time';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';

const INDUSTRY_SKILL_IDS = [
  ...Object.values(SLOT_SKILLS).flatMap((skills) => skills.map((skill) => skill.id)),
  INDUSTRY_SKILL_ID,
  ADVANCED_INDUSTRY_SKILL_ID,
  REACTIONS_SKILL_ID,
].map(String);

function industryLevels(levels: Record<string, number>): Record<string, number> {
  return Object.fromEntries(INDUSTRY_SKILL_IDS.map((id) => [id, levels[id] ?? 0]));
}

// authz: auth
// input: none
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse(industrySlotsEndpoint, 200, { characters: [] });
  }
  const perCharacter = await measureOwnedDataRead({
    endpoint: '/api/account/industry-slots',
    read: () => getSkillLevelsForUserOnView(userId),
    returned: (value) => value.length,
  });
  return apiResponse(industrySlotsEndpoint, 200, {
    characters: perCharacter.map(({ characterId, levels }) => ({
      characterId,
      slots: slotCapacity(levels),
      synced: levels !== null,
      levels: levels === null ? null : industryLevels(levels),
    })),
  });
}

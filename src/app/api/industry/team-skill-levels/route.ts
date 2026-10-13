import { getSkillLevelsForUserOnView } from '@/composition/sync/skills-sync';
import { getCurrentUserId } from '@/composition/session';
import { teamSkillLevelsEndpoint } from '@/features/industry-planner/api-contract';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';

// authz: auth
// input: none
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return apiResponse(teamSkillLevelsEndpoint, 200, { characters: [], refreshing: false });
  const result = await measureOwnedDataRead({
    endpoint: teamSkillLevelsEndpoint,
    read: () => getSkillLevelsForUserOnView(userId),
    returned: (value) => value.characters.length,
  });
  return apiResponse(teamSkillLevelsEndpoint, 200, result);
}

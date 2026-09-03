import { getSkillsForUserOnView } from '@/composition/sync/skills-sync';
import { getCurrentUserId } from '@/platform/auth/session';
import { skillsEndpoint } from '@/features/skill-queue/api-contract';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';

// authz: auth
// input: none
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse(skillsEndpoint, 200, { characters: [], names: {} });
  }
  const result = await measureOwnedDataRead({
    endpoint: '/api/account/skills',
    read: () => getSkillsForUserOnView(userId),
    returned: (value) => value.characters.length,
  });
  return apiResponse(skillsEndpoint, 200, result);
}

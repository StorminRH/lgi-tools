import { getSkillLevelsForUserOnView } from '@/composition/sync/skills-sync';
import { getCurrentUserId } from '@/platform/auth/session';
import { industrySlotsEndpoint } from '@/features/industry-jobs/api-contract';
import { slotCapacity } from '@/features/industry-jobs/slots';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';

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
    })),
  });
}

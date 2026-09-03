import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { getSkillLevelsForCharacterOnView } from '@/composition/sync/skills-sync';
import { getCurrentUserId } from '@/platform/auth/session';
import {
  skillLevelsEndpoint,
  skillLevelsRequestSchema,
} from '@/features/industry-planner/api-contract';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

export const POST = capabilityRoute('planner.read-skill-levels', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
  const parsed = await readJsonBody(request, skillLevelsRequestSchema);
  if (!parsed.ok) return apiResponse(skillLevelsEndpoint, 400, parsed.failure);

  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse(skillLevelsEndpoint, 200, { levels: null });
  }
  const levels = await measureOwnedDataRead({
    endpoint: '/api/industry/skill-levels',
    requested: 1,
    read: () => getSkillLevelsForCharacterOnView(userId, parsed.data.characterId),
    returned: (value) => (value === null ? 0 : 1),
  });
  return apiResponse(skillLevelsEndpoint, 200, { levels });
}

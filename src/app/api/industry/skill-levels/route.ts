import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { getSkillLevelsForCharacterOnView } from '@/composition/sync/skills-sync';
import { getCurrentUserId } from '@/composition/session';
import {
  skillLevelsEndpoint,
  skillLevelsRequestSchema,
} from '@/features/industry-planner/api-contract';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/**
 * POST /api/industry/skill-levels
 * Body: \{ characterId \}
 *
 * The selected build character's trained ACTIVE skill levels for the planner's
 * skills→time lever (3.7.19.1), read from the skills tracker's Neon store with
 * the same stale-gated on-view write-behind refresh as the skills page. The
 * character must be one of the caller's linked characters (the user id comes
 * from the session, never the body). Every degraded arm — anonymous caller,
 * someone else's character, never-synced or pre-column row — answers
 * `levels: null` (200): the planner fails open to the no-skill baseline.
 */
// authz: auth
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

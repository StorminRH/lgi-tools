import { getSkillsForUserOnView } from '@/composition/sync/skills-sync';
import { getCurrentUserId } from '@/platform/auth/session';
import { skillsEndpoint } from '@/features/skill-queue/api-contract';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';

/**
 * GET /api/account/skills
 *
 * The signed-in user's per-character trained totals + training queue, read from Neon
 * with a stale-gated on-view write-behind refresh (the queue moved off the live Convex
 * engine in MIGRATE.B.1). Scoped to the authenticated caller's own characters (the user
 * id comes from the session, never the client); an anonymous caller gets an empty list.
 * The client derives the live countdown from each entry's absolute finish_date.
 */
// authz: auth
// input: none
// validation: none — no request input (the user id is session-derived, not client-posted)
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

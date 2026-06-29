import { getSkillsForUserOnView } from '@/db/skills-sync';
import { getCurrentUserId } from '@/features/auth/session';
import type { SkillsResponse } from '@/features/skill-queue/api-contract';

// GET /api/account/skills
//
// The signed-in user's per-character trained totals + training queue, read from Neon
// with a stale-gated on-view write-behind refresh (the queue moved off the live Convex
// engine in MIGRATE.B.1). Scoped to the authenticated caller's own characters (the user
// id comes from the session, never the client); an anonymous caller gets an empty list.
// The client derives the live countdown from each entry's absolute finish_date.
// authz: auth
// validation: none — no request input (the user id is session-derived, not client-posted)
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ characters: [], names: {} } satisfies SkillsResponse);
  }
  const result = await getSkillsForUserOnView(userId);
  return Response.json(result satisfies SkillsResponse);
}

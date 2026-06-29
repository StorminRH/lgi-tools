import { getJobsForUserOnView } from '@/db/industry-jobs-sync';
import { getCurrentUserId } from '@/features/auth/session';
import type { JobsResponse } from '@/features/industry-jobs/api-contract';

// GET /api/account/industry-jobs
//
// The signed-in user's per-character active industry-job boards, read from Neon with a
// stale-gated on-view write-behind refresh (the personal job board moved off the live
// Convex engine in MIGRATE.B.2). Scoped to the authenticated caller's own characters (the
// user id comes from the session, never the client); an anonymous caller gets an empty
// list. The client derives each job's live "ready" + countdown from its absolute
// end_date — there is no server-side completion flip.
// authz: auth
// validation: none — no request input (the user id is session-derived, not client-posted)
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ characters: [], names: {} } satisfies JobsResponse);
  }
  const result = await getJobsForUserOnView(userId);
  return Response.json(result satisfies JobsResponse);
}

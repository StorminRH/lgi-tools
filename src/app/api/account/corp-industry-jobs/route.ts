import { getCorpJobsForUserOnView } from '@/db/corp-industry-jobs-sync';
import { getCurrentUserId } from '@/features/auth/session';
import type { CorpJobsResponse } from '@/features/industry-jobs/api-contract';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';

// GET /api/account/corp-industry-jobs
//
// The signed-in user's per-corporation active industry-job boards, read from Neon with a
// stale-gated on-view write-behind refresh (corp jobs moved off the live Convex engine in
// MIGRATE.B.3). Corp-token resolution is the membership/affiliation director pattern (not
// corpSync). Scoped to the authenticated caller's own corporations (the user id comes from
// the session, never the client); an anonymous caller gets an empty list. The client
// derives each job's live "ready" + countdown from its absolute end_date — there is no
// server-side completion flip.
// authz: auth
// validation: none — no request input (the user id is session-derived, not client-posted)
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ corporations: [], names: {} } satisfies CorpJobsResponse);
  }
  const result = await measureOwnedDataRead({
    endpoint: '/api/account/corp-industry-jobs',
    read: () => getCorpJobsForUserOnView(userId),
    returned: (value) => value.corporations.length,
  });
  return Response.json(result satisfies CorpJobsResponse);
}

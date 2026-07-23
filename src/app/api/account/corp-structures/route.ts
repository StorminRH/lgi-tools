import { getCorpStructuresForUserOnView } from '@/composition/sync/corp-structures-sync';
import { getCurrentUserId } from '@/platform/auth/session';
import type { CorpStructuresResponse } from '@/features/owned-structures/api-contract';

/**
 * GET /api/account/corp-structures
 *
 * The signed-in user's owned-structure catalogues, one per corporation they are a
 * current member of, read from Neon with a stale-gated on-view write-behind refresh
 * (3.7.9). The catalogue is shared per corp — every member reads the same rows — and
 * the read is scoped to the caller's corp membership (the user id comes from the
 * session, never the client); an anonymous caller gets an empty list. Each structure
 * carries its authoritative name (free from the corp endpoint) and the SDE-derived
 * security band the planner's bonus math reads. The build-location selector that
 * consumes this lands next session.
 */
// authz: auth
// input: none
// validation: none — no request input (the user id is session-derived, not client-posted)
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ corporations: [] } satisfies CorpStructuresResponse);
  }
  const result = await getCorpStructuresForUserOnView(userId);
  return Response.json(result satisfies CorpStructuresResponse);
}

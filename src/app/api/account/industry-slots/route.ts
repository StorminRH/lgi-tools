import { getSkillLevelsForUserOnView } from '@/composition/sync/skills-sync';
import { getCurrentUserId } from '@/platform/auth/session';
import type { IndustrySlotsResponse } from '@/features/industry-jobs/api-contract';
import { slotCapacity } from '@/features/industry-jobs/slots';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';

/**
 * GET /api/account/industry-slots
 *
 * The signed-in user's per-character industry slot capacity (manufacturing /
 * science / reactions), computed from each character's trained slot skills —
 * the batched Neon read fires the same stale-gated (120s/character) skills
 * write-behind the /skills page uses, checked before any token vend, so a
 * fresh character costs no ESI call. A character whose skills never synced
 * fails open to the base 1/1/1 with synced:false (the client's one-shot
 * reconcile signal). Scoped to the authenticated caller (the user id comes
 * from the session, never the client); an anonymous caller gets an empty list.
 */
// authz: auth
// input: none
// validation: none — no request input (the user id is session-derived, not client-posted)
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ characters: [] } satisfies IndustrySlotsResponse);
  }
  const perCharacter = await measureOwnedDataRead({
    endpoint: '/api/account/industry-slots',
    read: () => getSkillLevelsForUserOnView(userId),
    returned: (value) => value.length,
  });
  return Response.json({
    characters: perCharacter.map(({ characterId, levels }) => ({
      characterId,
      slots: slotCapacity(levels),
      synced: levels !== null,
    })),
  } satisfies IndustrySlotsResponse);
}

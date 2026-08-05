// Convex characterLocation + mapTracking teardown — the purge contributor for
// the two location-tracking homes that live in Convex, not Neon (4.0.4.2.1;
// NON_NEON_HOMES entries). The schema-reflection gate can't see a Convex table,
// so this contributor claims NO Neon table — its job is purely to reach across
// to the deployment and delete the live tracking/location docs that no later
// sync would orphan-clean for a removed account.
//
// BEST-EFFORT, NEVER THROWS: the orchestrator awaits each contributor with no
// try/catch (composition/purge/orchestrator.ts), so a thrown error here would
// abort the Neon purge mid-tier. Unlike the online-status contributor this
// residue is NOT harmless-regenerable: mapTracking is a durable opt-in and a
// deleted account has no later sync to orphan-clean either table, so a failed
// delete must be DETECTABLE — bestEffort logs the structured failure line —
// and the purge-map-access door's tracking sweep is the in-deployment
// backstop for the mapTracking half.
import { bestEffort } from '@/lib/best-effort';
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';
import type { PurgeContributor } from '@/platform/purge/types';

async function postPurgeLocationTracking(
  userId: string,
  characterId: number | null,
): Promise<void> {
  const subject = characterId === null ? userId : `${userId}:${characterId}`;
  await bestEffort('location-tracking/purge', 'convex-teardown', subject, async () => {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) return;
    const siteUrl = deriveConvexSiteUrl(convexUrl);
    const secret = readEnv('CONVEX_SERVICE_SECRET');
    if (siteUrl === null || !secret) return;
    const response = await fetchWithTimeout(`${siteUrl}/purge-location-tracking`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ userId, characterId }),
    });
    // A non-2xx (rotated bearer, deploy drift) is a REAL missed delete —
    // surface it through bestEffort's failure line instead of asserting done.
    if (!response.ok) {
      throw new Error(`purge-location-tracking ${response.status}`);
    }
  });
}

/**
 * Personal-data purge contributor for location-tracking Convex homes; this data
 * slice owns deleting its user- and character-keyed rows.
 */
export const locationTrackingPurgeContributor: PurgeContributor = {
  name: 'location-tracking',
  // 'durable', not 'cache': characterLocation is a regenerable mirror, but
  // mapTracking is app-authored opt-in state with no upstream to rebuild from
  // (the schema header's mapTracking carve-out) — the stricter table decides
  // the tier.
  tier: 'durable',
  claims: [],
  purgeCharacter: ({ userId, characterId }) =>
    postPurgeLocationTracking(userId, characterId),
  purgeUser: ({ userId }) => postPurgeLocationTracking(userId, null),
};

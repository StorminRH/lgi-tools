// Convex characterLocation + mapTracking teardown — the purge contributor for
// the two location-tracking homes that live in Convex, not Neon (4.0.4.2.1;
// NON_NEON_HOMES entries). The schema-reflection gate can't see a Convex table,
// so this contributor claims NO Neon table — its job is purely to reach across
// to the deployment and delete the live tracking/location docs that no later
// sync would orphan-clean for a removed account.
//
// BEST-EFFORT, NEVER THROWS: the orchestrator awaits each contributor with no
// try/catch (composition/purge/orchestrator.ts), so a thrown error here would
// abort the Neon purge mid-tier. A lost Convex delete just leaves a regenerable,
// never-re-synced orphan row (Neon is authoritative; Convex is derived), which
// is harmless. Mirrors the online-status contributor's transport.
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';
import type { PurgeContributor } from '@/platform/purge/types';

async function postPurgeLocationTracking(
  userId: string,
  characterId: number | null,
): Promise<void> {
  try {
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) return;
    const siteUrl = deriveConvexSiteUrl(convexUrl);
    const secret = readEnv('CONVEX_SERVICE_SECRET');
    if (siteUrl === null || !secret) return;
    await fetchWithTimeout(`${siteUrl}/purge-location-tracking`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ userId, characterId }),
    });
  } catch {
    // Best-effort: swallow every failure so the Neon purge completes.
  }
}

/**
 * Personal-data purge contributor for location-tracking Convex homes; this data
 * slice owns deleting its user- and character-keyed rows.
 */
export const locationTrackingPurgeContributor: PurgeContributor = {
  name: 'location-tracking',
  // characterLocation / mapTracking are regenerable live state, not credential
  // or durable Neon data.
  tier: 'cache',
  claims: [],
  purgeCharacter: ({ userId, characterId }) =>
    postPurgeLocationTracking(userId, characterId),
  purgeUser: ({ userId }) => postPurgeLocationTracking(userId, null),
};

// Convex characterOnline teardown — the purge contributor for the one user/character
// data home that lives in Convex, not Neon (ACCOUNT.2; the NON_NEON_HOMES entry the
// ACCOUNT.1 gate forecast). The schema-reflection gate can't see a Convex table, so
// this contributor claims NO Neon table — its job is purely to reach across to the
// deployment and delete the live online docs that no later sync would orphan-clean
// for a removed account.
//
// BEST-EFFORT, NEVER THROWS: the orchestrator awaits each contributor with no
// try/catch (src/purge/orchestrator.ts), so a thrown error here would abort the Neon
// purge mid-tier. A lost Convex delete just leaves a regenerable, never-re-synced
// orphan row (Neon is authoritative; Convex is derived), which is harmless. Mirrors
// the cron sweeper's transport (deriveConvexSiteUrl + Bearer CONVEX_SERVICE_SECRET +
// fetchWithTimeout), swallowing every failure instead of returning a status.
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';
import type { PurgeContributor } from '@/purge/types';

// Fire the bearer-gated teardown POST at the deployment's HTTP-actions origin.
// characterId null tears down the whole user (an account-nuke); a number tears down
// one character (a single character-purge).
async function postPurgeOnline(userId: string, characterId: number | null): Promise<void> {
  try {
    // NEXT_PUBLIC_* is build-inlined (read directly, not via readEnv — the sweep
    // route precedent); absent on a Convex-less build → nothing to tear down.
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) return;
    const siteUrl = deriveConvexSiteUrl(convexUrl);
    const secret = readEnv('CONVEX_SERVICE_SECRET');
    if (siteUrl === null || !secret) return;
    await fetchWithTimeout(`${siteUrl}/purge-online`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ userId, characterId }),
    });
  } catch {
    // Best-effort: swallow every failure (Convex down, network blip, bad URL) so the
    // Neon purge completes. The next sync's lazy orphan-clean is the backstop.
  }
}

export const onlineStatusPurgeContributor: PurgeContributor = {
  name: 'online-status',
  // characterOnline is a regenerable ESI mirror, not credential or durable data.
  tier: 'cache',
  // No Neon table — the live doc lives in Convex, invisible to the schema gate.
  claims: [],
  purgeCharacter: ({ userId, characterId }) => postPurgeOnline(userId, characterId),
  purgeUser: ({ userId }) => postPurgeOnline(userId, null),
};

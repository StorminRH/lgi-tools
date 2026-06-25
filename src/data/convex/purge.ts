// Next → Convex prompt projection teardown (3.7.1.3). The owner-hash transfer
// purge (src/features/auth/queries.ts) calls this to tear down the prior owner's
// live projections IMMEDIATELY, rather than waiting for the next lazy orphan
// sweep. Mirrors the cron sync-sweeper's transport: derive the deployment's
// .convex.site origin and POST with the shared service-secret bearer.
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';

// BEST-EFFORT BY DESIGN. The Neon-side purge (account row + tokens) is the
// security-critical step and has already run; this teardown must never throw or
// it would abort the in-flight sign-in. A Convex outage here degrades gracefully
// to the existing lazy orphan cleanup (applySyncResults deletes docs for any
// character no longer enumerated for the user), which fires on the next sync.
export async function purgeConvexCharacterProjections(
  userId: string,
  characterId: number,
): Promise<void> {
  // Literal read — build-inlined by Next (the sync-sweeper precedent): on Vercel
  // this var lives only in the build env. A Convex-less deployment simply has
  // nothing to tear down.
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return;
  const siteUrl = deriveConvexSiteUrl(convexUrl);
  if (siteUrl === null) return;
  const secret = readEnv('CONVEX_SERVICE_SECRET');
  if (!secret) return;

  try {
    const res = await fetchWithTimeout(`${siteUrl}/purge-character`, {
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ userId, characterId }),
    });
    if (!res.ok) {
      console.error(
        `[auth] prompt Convex purge failed (${res.status}) for character ${characterId} — lazy cleanup will catch it`,
      );
    }
  } catch (err) {
    console.error('[auth] prompt Convex purge request failed — lazy cleanup will catch it', err);
  }
}

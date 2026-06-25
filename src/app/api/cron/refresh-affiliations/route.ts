import { logUsageEvent } from '@/data/telemetry/queries';
import { directClient } from '@/db';
import { ADVISORY_LOCK_AFFILIATION_REFRESH, refreshAffiliations } from '@/features/auth/affiliation';
import type { CronRefreshAffiliationsResponse } from '@/features/auth/api-contract';
import { listStaleLinkedCharacterIds } from '@/features/auth/queries';
import { requireCronAuth } from '@/lib/cron';

// Awaited fire-and-forget telemetry: the structured boundary line surfaces in
// Vercel runtime logs; the usage row is swallowed so observability never breaks
// the cron, and awaited so it lands before the function freezes.
async function logCronEvent(metadata: Record<string, unknown>): Promise<void> {
  console.log(JSON.stringify({ scope: 'cron:affiliations', ...metadata }));
  try {
    await logUsageEvent({ action: 'cron_affiliations', metadata });
  } catch (err) {
    console.error('[cron:affiliations] telemetry write failed', err);
  }
}

// Vercel cron endpoint (3.7.3.2). Wired to "20 11 * * *" in vercel.json (11:20
// UTC — after the 11:00–11:15 daily downtime and clear of the 11:30/:40/:50
// prices/indices/SDE sweeps on the direct Neon endpoint). Vercel dispatches GET
// with `Authorization: Bearer ${CRON_SECRET}`.
//
// Refreshes the cached corp affiliation of every LINKED character that has gone
// stale (> TTL) since a login/on-view last warmed it — the dormant-character
// backstop so the membership gate never fails closed on a member who just hasn't
// been active. The advisory lock skips an overlapping run of itself (the writes
// are idempotent — it guards a redundant double ESI pull, not data integrity).
export const maxDuration = 60;

const LOCK_KEY_NUM = Number(ADVISORY_LOCK_AFFILIATION_REFRESH);

// No user input — bearer-auth only, no body or query params consumed.
// authz: cron
export async function GET(req: Request): Promise<Response> {
  const denied = await requireCronAuth(req);
  if (denied) return denied;

  const start = Date.now();

  const reserved = await directClient.reserve();
  let lockHeld = false;
  try {
    const lockResult = await reserved<{ got: boolean }[]>`
      SELECT pg_try_advisory_lock(${LOCK_KEY_NUM}) AS got
    `;
    if (!lockResult[0].got) {
      // Another refresh holds the lock — skip rather than double-pull ESI.
      await logCronEvent({ outcome: 'busy', durationMs: Date.now() - start });
      return Response.json({ status: 'busy' } satisfies CronRefreshAffiliationsResponse);
    }
    lockHeld = true;

    // The lock stays on `reserved`; the enumeration + bulk affiliation read +
    // upserts run on the request `db` (small row counts, no need to pin the
    // locked backend). The ESI call happens with no transaction open.
    const staleIds = await listStaleLinkedCharacterIds();
    const refreshed = await refreshAffiliations(staleIds);

    await logCronEvent({
      outcome: 'refreshed',
      stale: staleIds.length,
      refreshed,
      durationMs: Date.now() - start,
    });

    return Response.json({
      status: 'refreshed',
      stale: staleIds.length,
      refreshed,
    } satisfies CronRefreshAffiliationsResponse);
  } finally {
    // Nest the unlock so reserved.release() is the OUTERMOST cleanup and always
    // runs — if the unlock query itself threw, skipping release() would leak the
    // connection AND leave the advisory lock held, wedging every later run at
    // 'busy' until the pool recycled it.
    try {
      if (lockHeld) {
        await reserved`SELECT pg_advisory_unlock(${LOCK_KEY_NUM})`;
      }
    } finally {
      reserved.release();
    }
  }
}

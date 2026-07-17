import { after } from 'next/server';
import { Redis } from '@upstash/redis';
import { resolveUpstashRest } from '@/lib/upstash';

const RECENT_EXHAUSTION_KEY = 'lgi:esi:recent-exhaustion';
const RECENT_EXHAUSTION_TTL_SECONDS = 35 * 60;

function resolveRedis(): Redis | null {
  const upstash = resolveUpstashRest();
  return upstash ? new Redis(upstash) : null;
}

/**
 * Starts a best-effort short-TTL marker recording that the public ESI budget
 * refused a request. The marker is an optimization hint, so missing Redis
 * configuration and write failures are swallowed rather than changing the
 * caller's refusal path.
 */
export function markRecentBudgetExhaustion(): void {
  const redis = resolveRedis();
  if (!redis) return;
  const write = () =>
    redis
      .set(RECENT_EXHAUSTION_KEY, 1, {
        ex: RECENT_EXHAUSTION_TTL_SECONDS,
      })
      .catch(() => {});
  // The refusal that triggers this write is thrown mid-request, so the
  // request-lifetime primitive keeps the hint write alive past the response
  // (the domain-events ledger pattern). Outside a request scope — the
  // standalone refresh scripts — `after` throws and the plain fire-and-forget
  // write preserves the previous behavior.
  try {
    after(write);
  } catch {
    void write();
  }
}

/**
 * Reports whether a recent public ESI budget refusal marker exists. `unknown`
 * means Redis is unconfigured or unreachable, so callers must preserve the
 * Neon-backed fallback rather than treating the marker as absent.
 */
export async function hasRecentBudgetExhaustion(): Promise<
  boolean | 'unknown'
> {
  const redis = resolveRedis();
  if (!redis) return 'unknown';
  try {
    return (await redis.get<unknown>(RECENT_EXHAUSTION_KEY)) !== null;
  } catch {
    return 'unknown';
  }
}

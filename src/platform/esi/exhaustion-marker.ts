import { resolveUpstashClient, type UpstashRedis } from '@/lib/upstash';

const RECENT_EXHAUSTION_KEY = 'lgi:esi:recent-exhaustion';
const RECENT_EXHAUSTION_TTL_SECONDS = 35 * 60;
// The marker is a hint on the ESI go/no-go path: a slow Redis must not add

const MARKER_TIMEOUT_MS = 2000;
const MARKER_RETRIES = 0;

function resolveRedis(): UpstashRedis | null {
  return resolveUpstashClient({
    timeoutMs: MARKER_TIMEOUT_MS,
    retries: MARKER_RETRIES,
  });
}

export function markRecentBudgetExhaustion(): void {
  const redis = resolveRedis();
  if (!redis) return;

  void redis
    .set(RECENT_EXHAUSTION_KEY, 1, {
      ex: RECENT_EXHAUSTION_TTL_SECONDS,
    })
    .catch(() => {});
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

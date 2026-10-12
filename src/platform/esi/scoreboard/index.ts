import { allowUnconfiguredUpstash, resolveUpstashRest } from '@/lib/upstash';
import { createMemoryScoreboard } from './memory';
import { createRedisScoreboard } from './redis';
import type { EsiAvailabilitySnapshot, EsiBudgetSnapshot, EsiScoreboard } from './types';

export {
  GROUP_FLOOR_SHARE,
  GROUP_FLOOR_SHARE_INTERACTIVE,
  HISTORY_CALLS_PER_MINUTE,
  NO_RESPONSE_STATUS,
  type EsiBudgetSnapshot,
  type EsiReport,
  type EsiScoreboard,
  type GroupBudget,
  type PreDispatchState,
} from './types';
export { normalizeEsiPath, resolveRetryAfter } from './keys';

const redisScoreboards = new Map<string, EsiScoreboard>();
let memoryScoreboard: EsiScoreboard | null = null;
let warnedMissingEnvDev = false;
let erroredMissingEnvProd = false;

export function resolveScoreboard(): EsiScoreboard | null {
  const upstash = resolveUpstashRest();
  if (upstash) {
    const cached = redisScoreboards.get(upstash.url);
    if (cached) return cached;
    const created = createRedisScoreboard(upstash.url, upstash.token);
    redisScoreboards.set(upstash.url, created);
    return created;
  }

  if (allowUnconfiguredUpstash()) {
    if (!warnedMissingEnvDev && process.env.NODE_ENV === 'development') {
      console.warn(
        '[esi] KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) not set — ESI budget scoreboard is per-process only in dev',
      );
      warnedMissingEnvDev = true;
    }
    memoryScoreboard ??= createMemoryScoreboard();
    return memoryScoreboard;
  }

  if (!erroredMissingEnvProd) {
    console.error(
      '[esi] budget scoreboard not configured: set KV_REST_API_URL + KV_REST_API_TOKEN (Vercel marketplace) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (direct Upstash) — ESI dispatch is failing closed',
    );
    erroredMissingEnvProd = true;
  }
  return null;
}

export async function readEsiBudgetSnapshot(): Promise<EsiBudgetSnapshot | null> {
  const scoreboard = resolveScoreboard();
  return scoreboard === null ? null : await scoreboard.budgetSnapshot();
}

/** The last hour of ESI calls as the gate saw them, or null when no scoreboard is configured. */
export async function readEsiAvailabilitySnapshot(): Promise<EsiAvailabilitySnapshot | null> {
  const scoreboard = resolveScoreboard();
  return scoreboard === null ? null : await scoreboard.availabilitySnapshot();
}

export function __resetScoreboardForTests(): void {
  redisScoreboards.clear();
  memoryScoreboard = null;
  warnedMissingEnvDev = false;
  erroredMissingEnvProd = false;
}

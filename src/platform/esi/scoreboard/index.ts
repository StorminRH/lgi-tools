import { allowUnconfiguredUpstash, resolveUpstashRest } from '@/lib/upstash';
import { createMemoryScoreboard, readMemoryBudgetSnapshot } from './memory';
import { createRedisScoreboard, readRedisBudgetSnapshot } from './redis';
import type { EsiBudgetSnapshot, EsiScoreboard } from './types';

export {
  BODY_CACHE_MAX_BYTES,
  type CachedEtagMeta,
  type EsiBudgetSnapshot,
  type EsiReport,
  type EsiScoreboard,
  type PreDispatchState,
} from './types';
export { normalizeEsiPath } from './keys';

type ResolvedScoreboard =
  | { backend: 'redis'; scoreboard: ReturnType<typeof createRedisScoreboard> }
  | { backend: 'memory'; scoreboard: ReturnType<typeof createMemoryScoreboard> };

const redisScoreboards = new Map<string, ReturnType<typeof createRedisScoreboard>>();
let memoryScoreboard: ReturnType<typeof createMemoryScoreboard> | null = null;
let warnedMissingEnvDev = false;
let erroredMissingEnvProd = false;

function resolveConcreteScoreboard(): ResolvedScoreboard | null {
  const upstash = resolveUpstashRest();
  if (upstash) {
    const cached = redisScoreboards.get(upstash.url);
    if (cached) return { backend: 'redis', scoreboard: cached };
    const created = createRedisScoreboard(upstash.url, upstash.token);
    redisScoreboards.set(upstash.url, created);
    return { backend: 'redis', scoreboard: created };
  }

  if (allowUnconfiguredUpstash()) {
    if (!warnedMissingEnvDev && process.env.NODE_ENV === 'development') {
      console.warn(
        '[esi] KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) not set — ESI budget scoreboard is per-process only in dev',
      );
      warnedMissingEnvDev = true;
    }
    memoryScoreboard ??= createMemoryScoreboard();
    return { backend: 'memory', scoreboard: memoryScoreboard };
  }

  if (!erroredMissingEnvProd) {
    console.error(
      '[esi] budget scoreboard not configured: set KV_REST_API_URL + KV_REST_API_TOKEN (Vercel marketplace) or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (direct Upstash) — ESI dispatch is failing closed',
    );
    erroredMissingEnvProd = true;
  }
  return null;
}

export function resolveScoreboard(): EsiScoreboard | null {
  return resolveConcreteScoreboard()?.scoreboard ?? null;
}

export async function readEsiBudgetSnapshot(): Promise<EsiBudgetSnapshot | null> {
  const scoreboard = resolveConcreteScoreboard();
  if (scoreboard === null) return null;
  return scoreboard.backend === 'redis'
    ? await readRedisBudgetSnapshot(scoreboard.scoreboard)
    : await readMemoryBudgetSnapshot(scoreboard.scoreboard);
}

export function __resetScoreboardForTests(): void {
  redisScoreboards.clear();
  memoryScoreboard = null;
  warnedMissingEnvDev = false;
  erroredMissingEnvProd = false;
}

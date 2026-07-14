import { readEnv } from '@/lib/env';
import { createMemoryScoreboard, readMemoryBudgetSnapshot } from './memory';
import { createRedisScoreboard, readRedisBudgetSnapshot } from './redis';
import type { EsiBudgetSnapshot, EsiScoreboard } from './types';

// Shared ESI budget scoreboard (3.4.5, Decision Record 11). CCP's limits are
// per-IP / per-app — shared across every serverless instance we run — so the
// mirror of what we've spent must be shared too. This is the storage layer:
// Upstash Redis (the real, shared thing) with an in-process fallback for
// dev/test. The esiFetch gate owns policy: when to refuse, what to throw, the
// trickle when Redis is unreachable. See ./types for the data model.

// The public scoreboard surface — interfaces, the error ceiling, the body-cache
// cap, and the path normalizer the gate also uses for its own keys.
export {
  ESI_ERROR_CEILING,
  BODY_CACHE_MAX_BYTES,
  type CachedEtagMeta,
  type EsiBudgetSnapshot,
  type EsiReport,
  type EsiScoreboard,
  type PreDispatchState,
} from './types';
export { normalizeEsiPath } from './keys';

// Same dual-naming acceptance as src/lib/rate-limit.ts: the Vercel
// marketplace provisions KV_REST_API_*, a direct Upstash signup gives
// UPSTASH_REDIS_REST_*.
function redisUrl(): string | undefined {
  return readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL');
}

function redisToken(): string | undefined {
  return readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN');
}

type ResolvedScoreboard =
  | { backend: 'redis'; scoreboard: ReturnType<typeof createRedisScoreboard> }
  | { backend: 'memory'; scoreboard: ReturnType<typeof createMemoryScoreboard> };

const redisScoreboards = new Map<string, ReturnType<typeof createRedisScoreboard>>();
let memoryScoreboard: ReturnType<typeof createMemoryScoreboard> | null = null;
let warnedMissingEnvDev = false;
let erroredMissingEnvProd = false;

// Pick the live scoreboard. Configured → Redis (shared, the real thing).
// Unconfigured in dev/test → in-process fallback so `pnpm dev` and vitest
// need no Upstash account. Unconfigured in production → null: the gate
// fails closed, and the one-time error makes the misconfigured deploy
// diagnosable from runtime logs.
function resolveConcreteScoreboard(): ResolvedScoreboard | null {
  const url = redisUrl();
  const token = redisToken();
  if (url && token) {
    const cached = redisScoreboards.get(url);
    if (cached) return { backend: 'redis', scoreboard: cached };
    const created = createRedisScoreboard(url, token);
    redisScoreboards.set(url, created);
    return { backend: 'redis', scoreboard: created };
  }

  if (process.env.NODE_ENV !== 'production') {
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

// Reset module state between Vitest cases. Not for runtime callers.
export function __resetScoreboardForTests(): void {
  redisScoreboards.clear();
  memoryScoreboard = null;
  warnedMissingEnvDev = false;
  erroredMissingEnvProd = false;
}

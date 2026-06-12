import { Redis } from '@upstash/redis';
import { readEnv } from '@/lib/env';

// Shared ESI budget scoreboard (3.4.5, Decision Record 11). CCP's limits are
// per-IP / per-app — shared across every serverless instance we run — so the
// mirror of what we've spent must be shared too. This module is the storage
// layer: Upstash Redis (REST over plain fetch, so it runs anywhere the gate
// runs — Vercel functions today, Convex actions later) with an in-process
// fallback for dev/test. The gate (index.ts) owns policy: when to refuse,
// what to throw, the trickle when Redis is unreachable.
//
// Two CCP limit systems are mirrored:
//  • Legacy error limit — per-IP, ALL routes, fixed 60s window, 100 non-2xx/3xx
//    responses, then 420 everywhere. Mirrored two ways and combined
//    pessimistically: a self-count of our own error responses (per
//    epoch-minute counters; survives routes that don't send the legacy
//    headers) and an echo of the lowest X-ESI-Error-Limit-Remain any instance
//    observed (expires at the window reset).
//  • Token-bucket rate limit (rolling out per route group since 2026-02) —
//    per-group X-Ratelimit-* state is stored for observability (the 3.4.9
//    sync engine schedules off it; nothing reads it for go/no-go yet), and a
//    429's Retry-After becomes a block key on the normalized route path that
//    pre-dispatch honors.
//
// ETag state also lives here: per-URL meta (etag/expires/content-type) and the
// cached body a 304 revalidation re-serves. Bodies are stored only for
// unauthenticated GETs at or under BODY_CACHE_MAX_BYTES — the shared cache
// must never hold per-character data, and the multi-hundred-KB region-dump
// pages churn every 5 minutes anyway, so caching them buys nothing.

// CCP's legacy error-limit ceiling: 100 non-2xx/3xx per 60s window.
export const ESI_ERROR_CEILING = 100;

// Cache bodies at or under this size (bytes). Per-type market responses fit;
// region-dump pages don't (deliberate — see header comment).
export const BODY_CACHE_MAX_BYTES = 131_072;

// Self-count minute keys live just past the two-bucket read window.
const ERROR_COUNT_TTL_SECONDS = 120;
// Echo TTL is the window reset CCP reported, clamped to a sane band.
const ECHO_TTL_MAX_SECONDS = 90;
// Group state outlives the ~15-min floating window by a margin.
const GROUP_STATE_TTL_SECONDS = 1200;
// ETag meta/body: refreshed on every revalidation, dropped after two idle days.
const ETAG_TTL_SECONDS = 172_800;
// A 429 with no usable Retry-After still blocks the route briefly.
const DEFAULT_RETRY_AFTER_SECONDS = 60;
const RETRY_AFTER_MAX_SECONDS = 3600;
// Hard timeout on every Redis REST call — the scoreboard sits on the go/no-go
// path of every ESI call and must fail fast, not stall it.
const REDIS_TIMEOUT_MS = 1500;

const KEY_PREFIX = 'lgi:esi';

export interface CachedEtagMeta {
  etag: string;
  expires: string | null;
  contentType: string | null;
}

export interface PreDispatchState {
  // min(echo ?? ceiling, ceiling − selfCount) — the pessimistic combination
  // of both error-limit mirrors.
  effectiveRemaining: number;
  // Seconds REMAINING on an active Retry-After block for this route, or null
  // when there is none. Remaining (not the original Retry-After duration) so
  // a scheduler can compute the retry deadline as `now + blockedRetryAfter`.
  blockedRetryAfter: number | null;
  // Stored ETag meta for this URL (only populated when the gate asked).
  etag: CachedEtagMeta | null;
}

// Everything the gate observed about one ESI response, pre-parsed. The
// scoreboard turns it into key writes; it never touches Response objects.
export interface EsiReport {
  url: string;
  status: number;
  errorLimitRemain: number | null;
  errorLimitReset: number | null;
  rateLimitGroup: string | null;
  rateLimitLimit: number | null;
  rateLimitRemaining: number | null;
  rateLimitUsed: number | null;
  retryAfter: number | null;
  // 200-with-ETag, eligible: store meta + body together (meta without a body
  // would make the next call burn 1 token on a 304 it can't serve — worse
  // than an unconditional 200).
  etagToStore: (CachedEtagMeta & { body: string }) | null;
  // 304: refresh the meta (new expires) and the body's TTL.
  refreshEtag: CachedEtagMeta | null;
}

export interface EsiScoreboard {
  preDispatch(url: string, wantEtag: boolean): Promise<PreDispatchState>;
  report(report: EsiReport): Promise<void>;
  getCachedBody(url: string): Promise<string | null>;
}

// Collapse numeric path segments so one block key covers a route, not one
// region/type permutation: /markets/10000002/orders/ → /markets/{n}/orders.
export function normalizeEsiPath(url: string): string {
  const path = new URL(url).pathname.replace(/\/+$/, '') || '/';
  return path
    .split('/')
    .map((seg) => (/^\d+$/.test(seg) ? '{n}' : seg))
    .join('/');
}

function epochMinute(): number {
  return Math.floor(Date.now() / 60_000);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function echoTtl(resetSeconds: number | null): number {
  return clamp(resetSeconds ?? DEFAULT_RETRY_AFTER_SECONDS, 1, ECHO_TTL_MAX_SECONDS);
}

function keyErrorCount(minute: number): string {
  return `${KEY_PREFIX}:err:count:${minute}`;
}
const KEY_ERROR_ECHO = `${KEY_PREFIX}:err:echo`;
function keyBlock(path: string): string {
  return `${KEY_PREFIX}:rl:block:${path}`;
}
function keyGroup(group: string): string {
  return `${KEY_PREFIX}:rl:group:${group}`;
}
// ETag keys carry the path + query only — every ESI URL shares one host (the
// lint rail guarantees it), so embedding it would just bloat thousands of
// per-type keys. Unlike normalizeEsiPath, no segment collapsing: the cache
// entry is per exact resource.
function urlPathAndQuery(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}
function keyEtagMeta(url: string): string {
  return `${KEY_PREFIX}:etag:meta:${urlPathAndQuery(url)}`;
}
function keyEtagBody(url: string): string {
  return `${KEY_PREFIX}:etag:body:${urlPathAndQuery(url)}`;
}

// The one atomic piece: never let a stale higher Remain reopen the gate.
// Absent key = the window rolled over, so the incoming value is fresh truth
// even when numerically higher than the last one any instance saw.
const WRITE_IF_LOWER_LUA = `local cur = redis.call('GET', KEYS[1])
if cur == false or tonumber(cur) > tonumber(ARGV[1]) then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
end
return 1`;

function parseStoredInt(value: string | null): number | null {
  if (value === null) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function parseStoredMeta(value: string | null): CachedEtagMeta | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as CachedEtagMeta).etag === 'string'
    ) {
      const meta = parsed as CachedEtagMeta;
      return {
        etag: meta.etag,
        expires: typeof meta.expires === 'string' ? meta.expires : null,
        contentType: typeof meta.contentType === 'string' ? meta.contentType : null,
      };
    }
  } catch {
    // Unreadable meta is the same as no meta.
  }
  return null;
}

class RedisScoreboard implements EsiScoreboard {
  private readonly redis: Redis;

  constructor(url: string, token: string) {
    this.redis = new Redis({
      url,
      token,
      // Stored values are raw strings (JSON we encode ourselves, body text);
      // the SDK's default JSON round-trip would corrupt them.
      automaticDeserialization: false,
      // Portable timeout (no AbortSignal.timeout — absent from Convex's
      // default runtime, and this slice must stay runtime-portable per
      // Decision Record 11). The factory has no settle hook to clear the
      // timer, so it fires regardless; aborting an already-settled request
      // is a no-op.
      signal: () => {
        const controller = new AbortController();
        setTimeout(
          () => controller.abort(new DOMException('signal timed out', 'TimeoutError')),
          REDIS_TIMEOUT_MS,
        );
        return controller.signal;
      },
      retry: { retries: 0 },
    });
  }

  async preDispatch(url: string, wantEtag: boolean): Promise<PreDispatchState> {
    const minute = epochMinute();
    const pipeline = this.redis.pipeline();
    pipeline.get(keyErrorCount(minute));
    pipeline.get(keyErrorCount(minute - 1));
    pipeline.get(KEY_ERROR_ECHO);
    pipeline.get(keyBlock(normalizeEsiPath(url)));
    if (wantEtag) pipeline.get(keyEtagMeta(url));
    const rows = await pipeline.exec<(string | null)[]>();

    // Sum the current and previous minute buckets: CCP's fixed 60s window has
    // an unknown phase, and two buckets are a strict conservative superset.
    const selfCount =
      (parseStoredInt(rows[0]) ?? 0) + (parseStoredInt(rows[1]) ?? 0);
    const echo = parseStoredInt(rows[2]);
    // The block value is its expiry as epoch seconds; surface time remaining.
    const blockExpiry = parseStoredInt(rows[3]);
    const blockRemaining =
      blockExpiry !== null ? blockExpiry - Math.floor(Date.now() / 1000) : null;
    return {
      effectiveRemaining: Math.min(
        echo ?? ESI_ERROR_CEILING,
        ESI_ERROR_CEILING - selfCount,
      ),
      blockedRetryAfter:
        blockRemaining !== null && blockRemaining > 0 ? blockRemaining : null,
      etag: wantEtag ? parseStoredMeta(rows[4] ?? null) : null,
    };
  }

  async report(report: EsiReport): Promise<void> {
    const pipeline = this.redis.pipeline();
    let queued = false;

    // Self-count every non-2xx/3xx we observe, regardless of which header
    // system the response carried. The docs leave it ambiguous whether errors
    // on token-bucket routes still deplete the per-IP error limit; over-
    // counting costs an early fallback, under-counting risks the ban.
    if (report.status >= 400) {
      const key = keyErrorCount(epochMinute());
      pipeline.incr(key);
      pipeline.expire(key, ERROR_COUNT_TTL_SECONDS);
      queued = true;
    }

    if (report.status === 420) {
      // The Remain header arrives stale on 420s — force the echo to zero.
      pipeline.eval(WRITE_IF_LOWER_LUA, [KEY_ERROR_ECHO], [
        '0',
        String(echoTtl(report.errorLimitReset)),
      ]);
      queued = true;
    } else if (report.errorLimitRemain !== null) {
      pipeline.eval(WRITE_IF_LOWER_LUA, [KEY_ERROR_ECHO], [
        String(report.errorLimitRemain),
        String(echoTtl(report.errorLimitReset)),
      ]);
      queued = true;
    }

    if (report.rateLimitGroup !== null && report.rateLimitLimit !== null) {
      pipeline.set(
        keyGroup(report.rateLimitGroup),
        JSON.stringify({
          limit: report.rateLimitLimit,
          remaining: report.rateLimitRemaining,
          used: report.rateLimitUsed,
          observedAt: Date.now(),
        }),
        { ex: GROUP_STATE_TTL_SECONDS },
      );
      queued = true;
    }

    if (report.status === 429) {
      const retryAfter = clamp(
        report.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS,
        1,
        RETRY_AFTER_MAX_SECONDS,
      );
      pipeline.set(
        keyBlock(normalizeEsiPath(report.url)),
        String(Math.floor(Date.now() / 1000) + retryAfter),
        { ex: retryAfter },
      );
      queued = true;
    }

    if (report.etagToStore !== null) {
      const { body, ...meta } = report.etagToStore;
      pipeline.set(keyEtagMeta(report.url), JSON.stringify(meta), {
        ex: ETAG_TTL_SECONDS,
      });
      pipeline.set(keyEtagBody(report.url), body, { ex: ETAG_TTL_SECONDS });
      queued = true;
    }

    if (report.refreshEtag !== null) {
      pipeline.set(keyEtagMeta(report.url), JSON.stringify(report.refreshEtag), {
        ex: ETAG_TTL_SECONDS,
      });
      pipeline.expire(keyEtagBody(report.url), ETAG_TTL_SECONDS);
      queued = true;
    }

    if (queued) await pipeline.exec();
  }

  async getCachedBody(url: string): Promise<string | null> {
    return await this.redis.get<string>(keyEtagBody(url));
  }
}

// Dev/test fallback with the same semantics over in-process state — and the
// readable spec for what the Redis implementation does.
class MemoryScoreboard implements EsiScoreboard {
  private errorCounts = new Map<number, number>();
  private echo: { value: number; expiresAt: number } | null = null;
  private blocks = new Map<string, { expiresAt: number }>();
  private metas = new Map<string, { meta: CachedEtagMeta; expiresAt: number }>();
  private bodies = new Map<string, { body: string; expiresAt: number }>();

  private writeEchoIfLower(value: number, ttlSeconds: number): void {
    const now = Date.now();
    if (this.echo !== null && this.echo.expiresAt > now && this.echo.value <= value) {
      return;
    }
    this.echo = { value, expiresAt: now + ttlSeconds * 1000 };
  }

  async preDispatch(url: string, wantEtag: boolean): Promise<PreDispatchState> {
    const now = Date.now();
    const minute = epochMinute();
    const selfCount =
      (this.errorCounts.get(minute) ?? 0) + (this.errorCounts.get(minute - 1) ?? 0);
    const echo =
      this.echo !== null && this.echo.expiresAt > now ? this.echo.value : null;
    const block = this.blocks.get(normalizeEsiPath(url));
    const meta = wantEtag ? this.metas.get(url) : undefined;
    return {
      effectiveRemaining: Math.min(
        echo ?? ESI_ERROR_CEILING,
        ESI_ERROR_CEILING - selfCount,
      ),
      blockedRetryAfter:
        block !== undefined && block.expiresAt > now
          ? Math.ceil((block.expiresAt - now) / 1000)
          : null,
      etag: meta !== undefined && meta.expiresAt > now ? meta.meta : null,
    };
  }

  async report(report: EsiReport): Promise<void> {
    const now = Date.now();
    const minute = epochMinute();

    if (report.status >= 400) {
      this.errorCounts.set(minute, (this.errorCounts.get(minute) ?? 0) + 1);
      // Only the current and previous buckets are ever read; prune the rest.
      for (const key of this.errorCounts.keys()) {
        if (key < minute - 1) this.errorCounts.delete(key);
      }
    }

    if (report.status === 420) {
      this.writeEchoIfLower(0, echoTtl(report.errorLimitReset));
    } else if (report.errorLimitRemain !== null) {
      this.writeEchoIfLower(report.errorLimitRemain, echoTtl(report.errorLimitReset));
    }

    // Group state is durable observability; the in-process fallback has no
    // reader, so it is deliberately not mirrored here.

    if (report.status === 429) {
      const retryAfter = clamp(
        report.retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS,
        1,
        RETRY_AFTER_MAX_SECONDS,
      );
      this.blocks.set(normalizeEsiPath(report.url), {
        expiresAt: now + retryAfter * 1000,
      });
    }

    if (report.etagToStore !== null) {
      const { body, ...meta } = report.etagToStore;
      const expiresAt = now + ETAG_TTL_SECONDS * 1000;
      this.metas.set(report.url, { meta, expiresAt });
      this.bodies.set(report.url, { body, expiresAt });
    }

    if (report.refreshEtag !== null) {
      const expiresAt = now + ETAG_TTL_SECONDS * 1000;
      this.metas.set(report.url, { meta: report.refreshEtag, expiresAt });
      const body = this.bodies.get(report.url);
      if (body !== undefined) body.expiresAt = expiresAt;
    }
  }

  async getCachedBody(url: string): Promise<string | null> {
    const entry = this.bodies.get(url);
    if (entry === undefined || entry.expiresAt <= Date.now()) return null;
    return entry.body;
  }
}

// Same dual-naming acceptance as src/lib/rate-limit.ts: the Vercel
// marketplace provisions KV_REST_API_*, a direct Upstash signup gives
// UPSTASH_REDIS_REST_*.
function redisUrl(): string | undefined {
  return readEnv('KV_REST_API_URL') ?? readEnv('UPSTASH_REDIS_REST_URL');
}

function redisToken(): string | undefined {
  return readEnv('KV_REST_API_TOKEN') ?? readEnv('UPSTASH_REDIS_REST_TOKEN');
}

const redisScoreboards = new Map<string, RedisScoreboard>();
let memoryScoreboard: MemoryScoreboard | null = null;
let warnedMissingEnvDev = false;
let erroredMissingEnvProd = false;

// Pick the live scoreboard. Configured → Redis (shared, the real thing).
// Unconfigured in dev/test → in-process fallback so `pnpm dev` and vitest
// need no Upstash account. Unconfigured in production → null: the gate
// fails closed, and the one-time error makes the misconfigured deploy
// diagnosable from runtime logs.
export function resolveScoreboard(): EsiScoreboard | null {
  const url = redisUrl();
  const token = redisToken();
  if (url && token) {
    const cached = redisScoreboards.get(url);
    if (cached) return cached;
    const created = new RedisScoreboard(url, token);
    redisScoreboards.set(url, created);
    return created;
  }

  if (process.env.NODE_ENV !== 'production') {
    if (!warnedMissingEnvDev && process.env.NODE_ENV === 'development') {
      console.warn(
        '[esi] KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) not set — ESI budget scoreboard is per-process only in dev',
      );
      warnedMissingEnvDev = true;
    }
    memoryScoreboard ??= new MemoryScoreboard();
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

// Reset module state between Vitest cases. Not for runtime callers.
export function __resetScoreboardForTests(): void {
  redisScoreboards.clear();
  memoryScoreboard = null;
  warnedMissingEnvDev = false;
  erroredMissingEnvProd = false;
}

import type { CachedEtagMeta } from './types';

// Redis key construction, the pure timing helpers, the one atomic Lua script,
// and the stored-value parsers — everything backend-agnostic that both the
// Redis and in-process scoreboards share.

// Echo TTL is the window reset CCP reported, clamped to a sane band.
const ECHO_TTL_MAX_SECONDS = 90;
// A 429 with no usable Retry-After still blocks the route briefly.
const DEFAULT_RETRY_AFTER_SECONDS = 60;
const RETRY_AFTER_MAX_SECONDS = 3600;

const KEY_PREFIX = 'lgi:esi';

/**
 * Collapse numeric path segments so one block key covers a route, not one
 * region/type permutation: /markets/10000002/orders/ → /markets/\{n\}/orders.
 */
export function normalizeEsiPath(url: string): string {
  const path = new URL(url).pathname.replace(/\/+$/, '') || '/';
  return path
    .split('/')
    .map((seg) => (/^\d+$/.test(seg) ? '{n}' : seg))
    .join('/');
}

export function epochMinute(): number {
  return Math.floor(Date.now() / 60_000);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function echoTtl(resetSeconds: number | null): number {
  return clamp(resetSeconds ?? DEFAULT_RETRY_AFTER_SECONDS, 1, ECHO_TTL_MAX_SECONDS);
}

/**
 * Clamp a 429's Retry-After to a sane block duration. Shared by both backends
 * so the bounding lives in exactly one place.
 */
export function resolveRetryAfter(retryAfter: number | null): number {
  return clamp(retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS, 1, RETRY_AFTER_MAX_SECONDS);
}

export function keyErrorCount(minute: number): string {
  return `${KEY_PREFIX}:err:count:${minute}`;
}
export const KEY_ERROR_ECHO = `${KEY_PREFIX}:err:echo`;
export function keyBlock(path: string): string {
  return `${KEY_PREFIX}:rl:block:${path}`;
}
export function keyGroup(group: string): string {
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
export function keyEtagMeta(url: string): string {
  return `${KEY_PREFIX}:etag:meta:${urlPathAndQuery(url)}`;
}
export function keyEtagBody(url: string): string {
  return `${KEY_PREFIX}:etag:body:${urlPathAndQuery(url)}`;
}

/**
 * The one atomic piece: never let a stale higher Remain reopen the gate.
 * Absent key = the window rolled over, so the incoming value is fresh truth
 * even when numerically higher than the last one any instance saw.
 */
export const WRITE_IF_LOWER_LUA = `local cur = redis.call('GET', KEYS[1])
if cur == false or tonumber(cur) > tonumber(ARGV[1]) then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
end
return 1`;

export function parseStoredInt(value: string | null): number | null {
  if (value === null) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export function parseStoredMeta(value: string | null): CachedEtagMeta | null {
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

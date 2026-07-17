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

/** Converts an epoch timestamp in milliseconds to its integer UTC minute bucket. */
export function epochMinute(): number {
  return Math.floor(Date.now() / 60_000);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Calculates the bounded Redis echo TTL in seconds from a retry-after value, preserving the
 * minimum observation window.
 */
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

/** Builds the Redis key for one ESI error-count minute bucket. */
export function keyErrorCount(minute: number): string {
  return `${KEY_PREFIX}:err:count:${minute}`;
}
/** Redis key for the shared ESI error-limit echo; its stored value is an absolute block observation. */
export const KEY_ERROR_ECHO = `${KEY_PREFIX}:err:echo`;
/** Builds the Redis key for one route-group dispatch block. */
export function keyBlock(path: string): string {
  return `${KEY_PREFIX}:rl:block:${path}`;
}
/** Builds the Redis key for one route-group budget state. */
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
/** Builds the Redis key for cached ETag response metadata for one normalized request. */
export function keyEtagMeta(url: string): string {
  return `${KEY_PREFIX}:etag:meta:${urlPathAndQuery(url)}`;
}
/** Builds the Redis key for the cached ETag response body paired with its metadata key. */
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

/** Parses a stored scoreboard integer and returns null for missing, malformed, or non-finite values. */
export function parseStoredInt(value: string | null): number | null {
  if (value === null) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses cached ETag metadata and returns null when the stored payload is absent or does not
 * satisfy the metadata contract.
 */
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

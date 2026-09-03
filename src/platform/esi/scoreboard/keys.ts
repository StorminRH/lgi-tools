import type { CachedEtagMeta } from './types';

const ECHO_TTL_MAX_SECONDS = 90;

const DEFAULT_RETRY_AFTER_SECONDS = 60;
const RETRY_AFTER_MAX_SECONDS = 3600;

const KEY_PREFIX = 'lgi:esi';

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

  }
  return null;
}

import { clamp } from '@/lib/math';

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

export function echoTtl(resetSeconds: number | null): number {
  return clamp(resetSeconds ?? DEFAULT_RETRY_AFTER_SECONDS, 1, ECHO_TTL_MAX_SECONDS);
}

export function resolveRetryAfter(retryAfter: number | null): number {
  return clamp(retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS, 1, RETRY_AFTER_MAX_SECONDS);
}

export function keyErrorCount(minute: number): string {
  return `${KEY_PREFIX}:err:count:${minute}`;
}
export function keyCallCount(minute: number): string {
  return `${KEY_PREFIX}:call:count:${minute}`;
}
export function keyFailureCount(minute: number): string {
  return `${KEY_PREFIX}:fail:count:${minute}`;
}
export const KEY_ERROR_ECHO = `${KEY_PREFIX}:err:echo`;
export function keyBlock(path: string): string {
  return `${KEY_PREFIX}:rl:block:${path}`;
}
export function keyGroupBlock(group: string): string {
  return `${KEY_PREFIX}:rl:block:group:${group}`;
}
/** The rate-limit group a normalized path answered under, learned from its headers. */
export function keyGroupOfPath(path: string): string {
  return `${KEY_PREFIX}:rl:group-of:${path}`;
}
export function keyGroupRemaining(group: string): string {
  return `${KEY_PREFIX}:rl:group:${group}:remaining`;
}
export function keyGroupLimit(group: string): string {
  return `${KEY_PREFIX}:rl:group:${group}:limit`;
}
export function keyHistoryCount(minute: number): string {
  return `${KEY_PREFIX}:history:count:${minute}`;
}

const HISTORY_PATH = '/markets/{n}/history';

/** Whether a normalized path is the market-history route, the one under a per-minute cap. */
export function isHistoryPath(path: string): boolean {
  return path === HISTORY_PATH;
}

export const WRITE_IF_LOWER_LUA = `local cur = redis.call('GET', KEYS[1])
if cur == false or tonumber(cur) > tonumber(ARGV[1]) then
  redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
end
return 1`;

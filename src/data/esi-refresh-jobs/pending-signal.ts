import { Redis } from '@upstash/redis';
import { resolveUpstashRest } from '@/lib/upstash';

const PENDING_WORK_KEY = 'lgi:esi-refresh:next-due';
const WRITE_IF_LOWER_LUA = `
local current = redis.call("GET", KEYS[1])
local current_number = current and tonumber(current) or nil
if current_number == nil or current_number > tonumber(ARGV[1]) then
  redis.call("SET", KEYS[1], ARGV[1])
  return 1
end
return 0
`;

function resolveRedis(): Redis | null {
  const upstash = resolveUpstashRest();
  return upstash ? new Redis(upstash) : null;
}

/**
 * Lowers the pending-work signal to `dueAt` if it is earlier than the stored
 * value, so concurrent enqueues can only pull the next wake time forward.
 * Missing Redis configuration and write failures are swallowed because the
 * daily Neon-backed heal run bounds a lost hint to about 24 hours.
 */
export async function advancePendingWorkSignal(dueAt: Date): Promise<void> {
  const redis = resolveRedis();
  if (!redis) return;
  try {
    await redis.eval(WRITE_IF_LOWER_LUA, [PENDING_WORK_KEY], [
      String(dueAt.getTime()),
    ]);
  } catch {
    // This is an optimization hint; durable queue state remains authoritative.
  }
}

/**
 * Replaces the signal with the post-drain residual truth: the earliest live
 * `nextAttemptAt`, or clears it when the queue holds no live jobs. Missing
 * Redis configuration and write failures leave the durable queue authoritative.
 */
export async function writeBackPendingWorkSignal(
  earliest: Date | null,
): Promise<void> {
  const redis = resolveRedis();
  if (!redis) return;
  try {
    if (earliest === null) {
      await redis.del(PENDING_WORK_KEY);
    } else {
      await redis.set(PENDING_WORK_KEY, earliest.getTime());
    }
  } catch {
    // The next successful drain or daily heal repairs a stale or missing hint.
  }
}

/**
 * Answers the drain's pre-Neon idle question from Redis alone: `due` when the
 * stored next-due time has arrived, `idle` when no job is due, and `unknown`
 * when Redis is unconfigured, unreachable, or contains an invalid value.
 */
export async function readPendingWorkSignal(
  now: Date,
): Promise<'due' | 'idle' | 'unknown'> {
  const redis = resolveRedis();
  if (!redis) return 'unknown';
  try {
    const stored = await redis.get<unknown>(PENDING_WORK_KEY);
    if (stored === null) return 'idle';
    const dueAt = Number(stored);
    if (!Number.isFinite(dueAt)) return 'unknown';
    return dueAt <= now.getTime() ? 'due' : 'idle';
  } catch {
    return 'unknown';
  }
}

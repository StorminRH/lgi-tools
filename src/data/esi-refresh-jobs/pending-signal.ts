import { resolveUpstashClient, type UpstashRedis } from '@/lib/upstash';

const PENDING_WORK_KEY = 'lgi:esi-refresh:next-due';
const SIGNAL_TIMEOUT_MS = 2000;
const SIGNAL_RETRIES = 0;
const WRITE_IF_LOWER_LUA = `
local current = redis.call("GET", KEYS[1])
local current_number = current and tonumber(current) or nil
if current_number == nil or current_number > tonumber(ARGV[1]) then
  redis.call("SET", KEYS[1], ARGV[1])
  return 1
end
return 0
`;

function resolveRedis(): UpstashRedis | null {
  return resolveUpstashClient({
    timeoutMs: SIGNAL_TIMEOUT_MS,
    retries: SIGNAL_RETRIES,
  });
}

export async function advancePendingWorkSignal(dueAt: Date): Promise<void> {
  const redis = resolveRedis();
  if (!redis) return;
  try {
    await redis.eval(WRITE_IF_LOWER_LUA, [PENDING_WORK_KEY], [
      String(dueAt.getTime()),
    ]);
  } catch {
  }
}

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
  }
}

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

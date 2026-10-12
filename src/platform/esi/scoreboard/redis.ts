import { createUpstashClient, type UpstashRedis } from '@/lib/upstash';
import { parseIntOrNull } from '../headers';
import { isFailedCall, sumCounts, windowMinutes } from './availability';
import {
  echoTtl,
  epochMinute,
  isHistoryPath,
  keyBlock,
  keyCallCount,
  keyErrorCount,
  keyFailureCount,
  keyGroupBlock,
  keyGroupLimit,
  keyGroupOfPath,
  keyGroupRemaining,
  keyHistoryCount,
  KEY_ERROR_ECHO,
  normalizeEsiPath,
  resolveRetryAfter,
  WRITE_IF_LOWER_LUA,
} from './keys';
import { effectiveRemaining } from './budget';
import {
  CALL_COUNT_TTL_SECONDS,
  ERROR_COUNT_TTL_SECONDS,
  GROUP_ECHO_TTL_SECONDS,
  GROUP_OF_PATH_TTL_SECONDS,
  HISTORY_COUNT_TTL_SECONDS,
  type EsiAvailabilitySnapshot,
  type EsiReport,
  type EsiBudgetSnapshot,
  type EsiScoreboard,
  type GroupBudget,
  type PreDispatchState,
} from './types';

const REDIS_TIMEOUT_MS = 1500;
const REDIS_RETRIES = 0;

type Pipeline = ReturnType<UpstashRedis['pipeline']>;
type Rows = (string | null)[];

function queueBudgetReads(pipeline: Pipeline, minute: number): void {
  pipeline.get(keyErrorCount(minute));
  pipeline.get(keyErrorCount(minute - 1));
  pipeline.get(KEY_ERROR_ECHO);
}

/** The group's echoed Remaining, its limit and its 429 block, in that order. */
function queueGroupReads(pipeline: Pipeline, group: string): void {
  pipeline.get(keyGroupRemaining(group));
  pipeline.get(keyGroupLimit(group));
  pipeline.get(keyGroupBlock(group));
}

function budgetFromRows(rows: Rows): Omit<EsiBudgetSnapshot, 'source'> {
  const selfCount =
    (parseIntOrNull(rows[0] ?? null) ?? 0) + (parseIntOrNull(rows[1] ?? null) ?? 0);
  const echo = parseIntOrNull(rows[2] ?? null);
  return {
    effectiveRemaining: effectiveRemaining(echo, selfCount),
    selfCount,
    echo,
  };
}

/** The seconds a stored block (its expiry in epoch seconds) still holds, or null once it has passed. */
function blockRemaining(row: string | null | undefined): number | null {
  const expiry = parseIntOrNull(row ?? null);
  const remaining = expiry === null ? null : expiry - Math.floor(Date.now() / 1000);
  return remaining !== null && remaining > 0 ? remaining : null;
}

function longestBlock(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

function groupBudgetFrom(group: string | null, rows: Rows | null): GroupBudget | undefined {
  if (group === null || rows === null) return undefined;
  const remaining = parseIntOrNull(rows[0] ?? null);
  const limit = parseIntOrNull(rows[1] ?? null);
  return remaining === null || limit === null ? undefined : { group, remaining, limit };
}

class RedisScoreboard implements EsiScoreboard {
  private readonly redis: UpstashRedis;
  /** The rate-limit group each normalized path answered under, as this process has seen or read it. */
  private readonly groupOfPath = new Map<string, string>();

  constructor(url: string, token: string) {
    this.redis = createUpstashClient({
      url,
      token,
      automaticDeserialization: false,
      timeoutMs: REDIS_TIMEOUT_MS,
      retries: REDIS_RETRIES,
    });
  }

  /**
   * One round trip in the steady state. The group's keys can only be read
   * once the path's group is known, so a path this process has never seen
   * reads the shared mapping here and the group's state in a second trip,
   * once; every call after it reads both together.
   */
  async preDispatch(url: string): Promise<PreDispatchState> {
    const path = normalizeEsiPath(url);
    const minute = epochMinute();
    const known = this.groupOfPath.get(path) ?? null;
    const pipeline = this.redis.pipeline();
    queueBudgetReads(pipeline, minute);
    pipeline.get(keyBlock(path));
    pipeline.get(keyHistoryCount(minute));
    pipeline.get(keyGroupOfPath(path));
    if (known !== null) queueGroupReads(pipeline, known);
    const rows = await pipeline.exec<Rows>();

    const group = known ?? this.learnGroup(path, rows[5] ?? null);
    const groupRows = known !== null ? rows.slice(6) : await this.readGroupState(group);
    const state: PreDispatchState = {
      effectiveRemaining: budgetFromRows(rows).effectiveRemaining,
      blockedRetryAfter: longestBlock(blockRemaining(rows[3]), blockRemaining(groupRows?.[2])),
    };
    const groupBudget = groupBudgetFrom(group, groupRows);
    if (groupBudget !== undefined) state.groupBudget = groupBudget;
    if (isHistoryPath(path)) state.historyCalls = parseIntOrNull(rows[4] ?? null) ?? 0;
    return state;
  }

  private learnGroup(path: string, row: string | null): string | null {
    if (row !== null) this.groupOfPath.set(path, row);
    return row;
  }

  private async readGroupState(group: string | null): Promise<Rows | null> {
    if (group === null) return null;
    const pipeline = this.redis.pipeline();
    queueGroupReads(pipeline, group);
    return pipeline.exec<Rows>();
  }

  async budgetSnapshot(): Promise<EsiBudgetSnapshot> {
    const minute = epochMinute();
    const pipeline = this.redis.pipeline();
    queueBudgetReads(pipeline, minute);
    const rows = await pipeline.exec<Rows>();
    return {
      ...budgetFromRows(rows),
      source: 'shared',
    };
  }

  async availabilitySnapshot(): Promise<EsiAvailabilitySnapshot> {
    const minutes = windowMinutes(epochMinute());
    const rows = await this.redis.mget<Rows>(
      ...minutes.map(keyCallCount),
      ...minutes.map(keyFailureCount),
    );
    const counts = rows.map((row) => parseIntOrNull(row ?? null));
    return {
      calls: sumCounts(counts.slice(0, minutes.length)),
      failures: sumCounts(counts.slice(minutes.length)),
      source: 'shared',
    };
  }

  async report(report: EsiReport): Promise<void> {
    const path = normalizeEsiPath(report.url);
    const pipeline = this.redis.pipeline();
    const queued = [
      this.queueCallCount(pipeline, report),
      this.queueHistoryCount(pipeline, path),
      this.queueErrorCount(pipeline, report),
      this.queueErrorEcho(pipeline, report),
      this.queueGroupEcho(pipeline, path, report),
      this.queueRetryBlock(pipeline, path, report),
    ];
    if (queued.some(Boolean)) await pipeline.exec();
  }

  private queueCallCount(pipeline: Pipeline, report: EsiReport): boolean {
    const minute = epochMinute();
    const keys = [keyCallCount(minute)];
    if (isFailedCall(report.status)) keys.push(keyFailureCount(minute));
    for (const key of keys) {
      pipeline.incr(key);
      pipeline.expire(key, CALL_COUNT_TTL_SECONDS);
    }
    return true;
  }

  /** Every market-history dispatch counts, answered or not: the cap is on calls made. */
  private queueHistoryCount(pipeline: Pipeline, path: string): boolean {
    if (!isHistoryPath(path)) return false;
    const key = keyHistoryCount(epochMinute());
    pipeline.incr(key);
    pipeline.expire(key, HISTORY_COUNT_TTL_SECONDS);
    return true;
  }

  private queueErrorCount(pipeline: Pipeline, report: EsiReport): boolean {
    if (report.status < 400) return false;
    const key = keyErrorCount(epochMinute());
    pipeline.incr(key);
    pipeline.expire(key, ERROR_COUNT_TTL_SECONDS);
    return true;
  }

  private queueErrorEcho(pipeline: Pipeline, report: EsiReport): boolean {
    if (report.status === 420) {
      pipeline.eval(WRITE_IF_LOWER_LUA, [KEY_ERROR_ECHO], [
        '0',
        String(echoTtl(report.errorLimitReset)),
      ]);
      return true;
    }
    if (report.errorLimitRemain !== null) {
      pipeline.eval(WRITE_IF_LOWER_LUA, [KEY_ERROR_ECHO], [
        String(report.errorLimitRemain),
        String(echoTtl(report.errorLimitReset)),
      ]);
      return true;
    }
    return false;
  }

  /**
   * What the answer's rate-limit headers say: the path's group, kept a
   * day, and the group's Remaining, lowest wins for the echo window, next
   * to the limit it is a share of.
   */
  private queueGroupEcho(pipeline: Pipeline, path: string, report: EsiReport): boolean {
    if (report.rlGroup === null) return false;
    this.groupOfPath.set(path, report.rlGroup);
    pipeline.set(keyGroupOfPath(path), report.rlGroup, { ex: GROUP_OF_PATH_TTL_SECONDS });
    if (report.rlRemaining !== null && report.rlLimit !== null) {
      pipeline.eval(WRITE_IF_LOWER_LUA, [keyGroupRemaining(report.rlGroup)], [
        String(report.rlRemaining),
        String(GROUP_ECHO_TTL_SECONDS),
      ]);
      pipeline.set(keyGroupLimit(report.rlGroup), String(report.rlLimit), { ex: GROUP_ECHO_TTL_SECONDS });
    }
    return true;
  }

  /** A 429 blocks the group it names, since every route in it shares the bucket; without a group, the path. */
  private queueRetryBlock(pipeline: Pipeline, path: string, report: EsiReport): boolean {
    if (report.status !== 429) return false;
    const retryAfter = resolveRetryAfter(report.retryAfter);
    pipeline.set(
      report.rlGroup === null ? keyBlock(path) : keyGroupBlock(report.rlGroup),
      String(Math.floor(Date.now() / 1000) + retryAfter),
      { ex: retryAfter },
    );
    return true;
  }
}

export function createRedisScoreboard(url: string, token: string): EsiScoreboard {
  return new RedisScoreboard(url, token);
}

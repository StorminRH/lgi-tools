import { createUpstashClient, type UpstashRedis } from '@/lib/upstash';
import { parseIntOrNull } from '../headers';
import { sumCounts, windowMinutes } from './availability';
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
  WRITE_IF_LOWER_LUA,
} from './keys';
import { summarizeReports, type ErrorEcho, type ReportBatch } from './report-batch';
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
    await this.reportMany([report]);
  }

  /** Every answer in one pipeline: counts by their sums, echoes at their lowest, blocks at their longest. */
  async reportMany(reports: readonly EsiReport[]): Promise<void> {
    if (reports.length === 0) return;
    const batch = summarizeReports(reports);
    const pipeline = this.redis.pipeline();
    queueCounts(pipeline, batch);
    queueErrorEcho(pipeline, batch.errorEcho);
    this.queueGroupEchoes(pipeline, batch);
    queueRetryBlocks(pipeline, batch.retryBlocks);
    await pipeline.exec();
  }

  /**
   * What the answers' rate-limit headers say: each path's group, kept a
   * day, and each group's Remaining, lowest wins for the echo window, next
   * to the limit it is a share of.
   */
  private queueGroupEchoes(pipeline: Pipeline, batch: ReportBatch): void {
    for (const [path, group] of batch.groupOfPath) {
      this.groupOfPath.set(path, group);
      pipeline.set(keyGroupOfPath(path), group, { ex: GROUP_OF_PATH_TTL_SECONDS });
    }
    for (const [group, echo] of batch.groupEchoes) {
      pipeline.eval(WRITE_IF_LOWER_LUA, [keyGroupRemaining(group)], [String(echo.remaining), String(GROUP_ECHO_TTL_SECONDS)]);
      pipeline.set(keyGroupLimit(group), String(echo.limit), { ex: GROUP_ECHO_TTL_SECONDS });
    }
  }
}

function queueIncrement(pipeline: Pipeline, key: string, by: number, ttlSeconds: number): void {
  if (by === 0) return;
  pipeline.incrby(key, by);
  pipeline.expire(key, ttlSeconds);
}

/**
 * Every dispatch counts as a call, and the failed ones as failures; every
 * non-2xx/3xx against the error budget; every market-history dispatch,
 * answered or not, against the history cap, since the cap is on calls made.
 */
function queueCounts(pipeline: Pipeline, batch: ReportBatch): void {
  const minute = epochMinute();
  queueIncrement(pipeline, keyCallCount(minute), batch.calls, CALL_COUNT_TTL_SECONDS);
  queueIncrement(pipeline, keyFailureCount(minute), batch.failures, CALL_COUNT_TTL_SECONDS);
  queueIncrement(pipeline, keyErrorCount(minute), batch.errors, ERROR_COUNT_TTL_SECONDS);
  queueIncrement(pipeline, keyHistoryCount(minute), batch.historyCalls, HISTORY_COUNT_TTL_SECONDS);
}

function queueErrorEcho(pipeline: Pipeline, echo: ErrorEcho | null): void {
  if (echo === null) return;
  pipeline.eval(WRITE_IF_LOWER_LUA, [KEY_ERROR_ECHO], [String(echo.remain), String(echoTtl(echo.reset))]);
}

/** Each blocked key holds until its Retry-After, stored as the epoch second it lifts. */
function queueRetryBlocks(pipeline: Pipeline, blocks: ReadonlyMap<string, number>): void {
  for (const [key, retryAfter] of blocks) {
    pipeline.set(key, String(Math.floor(Date.now() / 1000) + retryAfter), { ex: retryAfter });
  }
}

export function createRedisScoreboard(url: string, token: string): EsiScoreboard {
  return new RedisScoreboard(url, token);
}

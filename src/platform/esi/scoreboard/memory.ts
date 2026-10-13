import { isFailedCall, sumCounts, windowMinutes } from './availability';
import {
  echoTtl,
  epochMinute,
  normalizeEsiPath,
  resolveRetryAfter,
} from './keys';
import { effectiveRemaining } from './budget';
import {
  AVAILABILITY_WINDOW_MINUTES,
  GROUP_ECHO_TTL_SECONDS,
  type EsiAvailabilitySnapshot,
  type EsiBudgetSnapshot,
  type EsiReport,
  type EsiScoreboard,
  type GroupBudget,
  type PreDispatchState,
} from './types';

interface Expiring {
  expiresAt: number;
}

interface GroupEcho extends Expiring {
  remaining: number;
  limit: number;
}

function live<T extends Expiring>(entry: T | undefined, now: number): T | null {
  return entry !== undefined && entry.expiresAt > now ? entry : null;
}

/** The seconds a block still holds, or null once it has passed. */
function blockRemaining(block: Expiring | undefined, now: number): number | null {
  const held = live(block, now);
  return held === null ? null : Math.ceil((held.expiresAt - now) / 1000);
}

function longestBlock(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

/** Drops every minute bucket older than the window that reads it. */
function pruneMinutes(buckets: Map<number, unknown>, minute: number, keepMinutes: number): void {
  for (const key of buckets.keys()) {
    if (key <= minute - keepMinutes) buckets.delete(key);
  }
}

class MemoryScoreboard implements EsiScoreboard {
  private errorCounts = new Map<number, number>();
  private callCounts = new Map<number, { calls: number; failures: number }>();
  private historyCounts = new Map<number, number>();
  private echo: { value: number; expiresAt: number } | null = null;
  private blocks = new Map<string, Expiring>();
  private groupBlocks = new Map<string, Expiring>();
  private groupOfPath = new Map<string, string>();
  private groupEchoes = new Map<string, GroupEcho>();

  private writeEchoIfLower(value: number, ttlSeconds: number): void {
    const now = Date.now();
    if (this.echo !== null && this.echo.expiresAt > now && this.echo.value <= value) {
      return;
    }
    this.echo = { value, expiresAt: now + ttlSeconds * 1000 };
  }

  /** The group's echo moves only downwards inside its window; after it, the next answer is fresh truth. */
  private writeGroupEchoIfLower(group: string, remaining: number, limit: number, now: number): void {
    const current = live(this.groupEchoes.get(group), now);
    if (current !== null && current.remaining <= remaining) return;
    this.groupEchoes.set(group, { remaining, limit, expiresAt: now + GROUP_ECHO_TTL_SECONDS * 1000 });
  }

  private groupBudgetOf(path: string, now: number): GroupBudget | undefined {
    const group = this.groupOfPath.get(path);
    const echo = group === undefined ? null : live(this.groupEchoes.get(group), now);
    return group === undefined || echo === null ? undefined : { group, remaining: echo.remaining, limit: echo.limit };
  }

  private budgetState(now: number): Omit<EsiBudgetSnapshot, 'source'> {
    const minute = epochMinute();
    const selfCount =
      (this.errorCounts.get(minute) ?? 0) + (this.errorCounts.get(minute - 1) ?? 0);
    const echo =
      this.echo !== null && this.echo.expiresAt > now ? this.echo.value : null;
    return {
      effectiveRemaining: effectiveRemaining(echo, selfCount),
      selfCount,
      echo,
    };
  }

  async preDispatch(url: string): Promise<PreDispatchState> {
    const now = Date.now();
    const path = normalizeEsiPath(url);
    const group = this.groupOfPath.get(path);
    const groupBudget = this.groupBudgetOf(path, now);
    const state: PreDispatchState = {
      effectiveRemaining: this.budgetState(now).effectiveRemaining,
      blockedRetryAfter: longestBlock(
        blockRemaining(this.blocks.get(path), now),
        group === undefined ? null : blockRemaining(this.groupBlocks.get(group), now),
      ),
    };
    if (groupBudget !== undefined) state.groupBudget = groupBudget;
    return state;
  }

  async budgetSnapshot(): Promise<EsiBudgetSnapshot> {
    return {
      ...this.budgetState(Date.now()),
      source: 'process-local',
    };
  }

  async availabilitySnapshot(): Promise<EsiAvailabilitySnapshot> {
    const buckets = windowMinutes(epochMinute()).map((minute) => this.callCounts.get(minute));
    return {
      calls: sumCounts(buckets.map((bucket) => bucket?.calls ?? null)),
      failures: sumCounts(buckets.map((bucket) => bucket?.failures ?? null)),
      source: 'process-local',
    };
  }

  private recordCall(minute: number, status: number): void {
    const bucket = this.callCounts.get(minute) ?? { calls: 0, failures: 0 };
    bucket.calls += 1;
    if (isFailedCall(status)) bucket.failures += 1;
    this.callCounts.set(minute, bucket);
    pruneMinutes(this.callCounts, minute, AVAILABILITY_WINDOW_MINUTES);
  }

  /** The process-local mirror of the shared reservation: the increment and the count it returns are one step. */
  async reserveHistoryCall(): Promise<number> {
    const minute = epochMinute();
    const count = (this.historyCounts.get(minute) ?? 0) + 1;
    this.historyCounts.set(minute, count);
    pruneMinutes(this.historyCounts, minute, 2);
    return count;
  }

  /** What the answer's rate-limit headers say: the path's group, and the group's remaining tokens. */
  private recordGroup(path: string, report: EsiReport, now: number): void {
    if (report.rlGroup === null) return;
    this.groupOfPath.set(path, report.rlGroup);
    if (report.rlRemaining !== null && report.rlLimit !== null) {
      this.writeGroupEchoIfLower(report.rlGroup, report.rlRemaining, report.rlLimit, now);
    }
  }

  /** A 429 blocks the group it names, since every route in it shares the bucket; without a group, the path. */
  private recordRetryBlock(path: string, report: EsiReport, now: number): void {
    if (report.status !== 429) return;
    const block = { expiresAt: now + resolveRetryAfter(report.retryAfter) * 1000 };
    if (report.rlGroup !== null) this.groupBlocks.set(report.rlGroup, block);
    else this.blocks.set(path, block);
  }

  async report(report: EsiReport): Promise<void> {
    const now = Date.now();
    const minute = epochMinute();
    const path = normalizeEsiPath(report.url);
    this.recordCall(minute, report.status);

    if (report.status >= 400) {
      this.errorCounts.set(minute, (this.errorCounts.get(minute) ?? 0) + 1);
      pruneMinutes(this.errorCounts, minute, 2);
    }

    if (report.status === 420) {
      this.writeEchoIfLower(0, echoTtl(report.errorLimitReset));
    } else if (report.errorLimitRemain !== null) {
      this.writeEchoIfLower(report.errorLimitRemain, echoTtl(report.errorLimitReset));
    }

    this.recordGroup(path, report, now);
    this.recordRetryBlock(path, report, now);
  }
}

export function createMemoryScoreboard(): EsiScoreboard {
  return new MemoryScoreboard();
}

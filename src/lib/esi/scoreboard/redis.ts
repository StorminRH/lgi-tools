import { Redis } from '@upstash/redis';
import {
  echoTtl,
  epochMinute,
  keyBlock,
  keyErrorCount,
  KEY_ERROR_ECHO,
  keyEtagBody,
  keyEtagMeta,
  keyGroup,
  normalizeEsiPath,
  parseStoredInt,
  parseStoredMeta,
  resolveRetryAfter,
  WRITE_IF_LOWER_LUA,
} from './keys';
import { effectiveRemaining } from './budget';
import {
  ERROR_COUNT_TTL_SECONDS,
  ETAG_TTL_SECONDS,
  GROUP_STATE_TTL_SECONDS,
  type EsiReport,
  type EsiBudgetSnapshot,
  type EsiScoreboard,
  type PreDispatchState,
} from './types';

// Hard timeout on every Redis REST call — the scoreboard sits on the go/no-go
// path of every ESI call and must fail fast, not stall it.
const REDIS_TIMEOUT_MS = 1500;

type Pipeline = ReturnType<Redis['pipeline']>;

function queueBudgetReads(pipeline: Pipeline, minute: number): void {
  pipeline.get(keyErrorCount(minute));
  pipeline.get(keyErrorCount(minute - 1));
  pipeline.get(KEY_ERROR_ECHO);
}

function budgetFromRows(rows: (string | null)[]): Omit<EsiBudgetSnapshot, 'source'> {
  // Sum the current and previous minute buckets: CCP's fixed 60s window has
  // an unknown phase, and two buckets are a strict conservative superset.
  const selfCount =
    (parseStoredInt(rows[0] ?? null) ?? 0) + (parseStoredInt(rows[1] ?? null) ?? 0);
  const echo = parseStoredInt(rows[2] ?? null);
  return {
    effectiveRemaining: effectiveRemaining(echo, selfCount),
    selfCount,
    echo,
  };
}

// Upstash Redis (REST over plain fetch, so it runs anywhere the gate runs —
// Vercel functions today, Convex actions later). The shared, real scoreboard.
export class RedisScoreboard implements EsiScoreboard {
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
    queueBudgetReads(pipeline, minute);
    pipeline.get(keyBlock(normalizeEsiPath(url)));
    if (wantEtag) pipeline.get(keyEtagMeta(url));
    const rows = await pipeline.exec<(string | null)[]>();

    const budget = budgetFromRows(rows);
    // The block value is its expiry as epoch seconds; surface time remaining.
    const blockExpiry = parseStoredInt(rows[3] ?? null);
    const blockRemaining =
      blockExpiry !== null ? blockExpiry - Math.floor(Date.now() / 1000) : null;
    return {
      effectiveRemaining: budget.effectiveRemaining,
      blockedRetryAfter:
        blockRemaining !== null && blockRemaining > 0 ? blockRemaining : null,
      etag: wantEtag ? parseStoredMeta(rows[4] ?? null) : null,
    };
  }

  async budgetSnapshot(): Promise<EsiBudgetSnapshot> {
    const minute = epochMinute();
    const pipeline = this.redis.pipeline();
    queueBudgetReads(pipeline, minute);
    const rows = await pipeline.exec<(string | null)[]>();
    return {
      ...budgetFromRows(rows),
      source: 'shared',
    };
  }

  async report(report: EsiReport): Promise<void> {
    const pipeline = this.redis.pipeline();
    // Run every concern (no short-circuit) so each gets its chance to queue,
    // then dispatch only when at least one write was actually enqueued.
    const queued = [
      this.queueErrorCount(pipeline, report),
      this.queueErrorEcho(pipeline, report),
      this.queueGroupState(pipeline, report),
      this.queueRetryBlock(pipeline, report),
      this.queueEtag(pipeline, report),
    ];
    if (queued.some(Boolean)) await pipeline.exec();
  }

  // Self-count every non-2xx/3xx we observe, regardless of which header
  // system the response carried. The docs leave it ambiguous whether errors
  // on token-bucket routes still deplete the per-IP error limit; over-
  // counting costs an early fallback, under-counting risks the ban.
  private queueErrorCount(pipeline: Pipeline, report: EsiReport): boolean {
    if (report.status < 400) return false;
    const key = keyErrorCount(epochMinute());
    pipeline.incr(key);
    pipeline.expire(key, ERROR_COUNT_TTL_SECONDS);
    return true;
  }

  private queueErrorEcho(pipeline: Pipeline, report: EsiReport): boolean {
    if (report.status === 420) {
      // The Remain header arrives stale on 420s — force the echo to zero.
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

  private queueGroupState(pipeline: Pipeline, report: EsiReport): boolean {
    if (report.rateLimitGroup === null || report.rateLimitLimit === null) {
      return false;
    }
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
    return true;
  }

  private queueRetryBlock(pipeline: Pipeline, report: EsiReport): boolean {
    if (report.status !== 429) return false;
    const retryAfter = resolveRetryAfter(report.retryAfter);
    pipeline.set(
      keyBlock(normalizeEsiPath(report.url)),
      String(Math.floor(Date.now() / 1000) + retryAfter),
      { ex: retryAfter },
    );
    return true;
  }

  private queueEtag(pipeline: Pipeline, report: EsiReport): boolean {
    let queued = false;
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
    return queued;
  }

  async getCachedBody(url: string): Promise<string | null> {
    return await this.redis.get<string>(keyEtagBody(url));
  }
}

export function readRedisBudgetSnapshot(
  scoreboard: RedisScoreboard,
): Promise<EsiBudgetSnapshot> {
  return scoreboard.budgetSnapshot();
}

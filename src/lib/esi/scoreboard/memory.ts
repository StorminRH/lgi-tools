import {
  echoTtl,
  epochMinute,
  normalizeEsiPath,
  resolveRetryAfter,
} from './keys';
import {
  ESI_ERROR_CEILING,
  ETAG_TTL_SECONDS,
  type CachedEtagMeta,
  type EsiReport,
  type EsiScoreboard,
  type PreDispatchState,
} from './types';

// Dev/test fallback with the same semantics over in-process state — and the
// readable spec for what the Redis implementation does.
export class MemoryScoreboard implements EsiScoreboard {
  private errorCounts = new Map<number, number>();
  private echo: { value: number; expiresAt: number } | null = null;
  private blocks = new Map<string, { expiresAt: number }>();
  private metas = new Map<string, { meta: CachedEtagMeta; expiresAt: number }>();
  private bodies = new Map<string, { body: string; expiresAt: number }>();

  private writeEchoIfLower(value: number, ttlSeconds: number): void {
    const now = Date.now();
    if (this.echo !== null && this.echo.expiresAt > now && this.echo.value <= value) {
      return;
    }
    this.echo = { value, expiresAt: now + ttlSeconds * 1000 };
  }

  async preDispatch(url: string, wantEtag: boolean): Promise<PreDispatchState> {
    const now = Date.now();
    const minute = epochMinute();
    const selfCount =
      (this.errorCounts.get(minute) ?? 0) + (this.errorCounts.get(minute - 1) ?? 0);
    const echo =
      this.echo !== null && this.echo.expiresAt > now ? this.echo.value : null;
    const block = this.blocks.get(normalizeEsiPath(url));
    const meta = wantEtag ? this.metas.get(url) : undefined;
    return {
      effectiveRemaining: Math.min(
        echo ?? ESI_ERROR_CEILING,
        ESI_ERROR_CEILING - selfCount,
      ),
      blockedRetryAfter:
        block !== undefined && block.expiresAt > now
          ? Math.ceil((block.expiresAt - now) / 1000)
          : null,
      etag: meta !== undefined && meta.expiresAt > now ? meta.meta : null,
    };
  }

  async report(report: EsiReport): Promise<void> {
    const now = Date.now();
    const minute = epochMinute();

    if (report.status >= 400) {
      this.errorCounts.set(minute, (this.errorCounts.get(minute) ?? 0) + 1);
      // Only the current and previous buckets are ever read; prune the rest.
      for (const key of this.errorCounts.keys()) {
        if (key < minute - 1) this.errorCounts.delete(key);
      }
    }

    if (report.status === 420) {
      this.writeEchoIfLower(0, echoTtl(report.errorLimitReset));
    } else if (report.errorLimitRemain !== null) {
      this.writeEchoIfLower(report.errorLimitRemain, echoTtl(report.errorLimitReset));
    }

    // Group state is durable observability; the in-process fallback has no
    // reader, so it is deliberately not mirrored here.

    if (report.status === 429) {
      const retryAfter = resolveRetryAfter(report.retryAfter);
      this.blocks.set(normalizeEsiPath(report.url), {
        expiresAt: now + retryAfter * 1000,
      });
    }

    if (report.etagToStore !== null) {
      const { body, ...meta } = report.etagToStore;
      const expiresAt = now + ETAG_TTL_SECONDS * 1000;
      this.metas.set(report.url, { meta, expiresAt });
      this.bodies.set(report.url, { body, expiresAt });
    }

    if (report.refreshEtag !== null) {
      const expiresAt = now + ETAG_TTL_SECONDS * 1000;
      this.metas.set(report.url, { meta: report.refreshEtag, expiresAt });
      const body = this.bodies.get(report.url);
      if (body !== undefined) body.expiresAt = expiresAt;
    }
  }

  async getCachedBody(url: string): Promise<string | null> {
    const entry = this.bodies.get(url);
    if (entry === undefined || entry.expiresAt <= Date.now()) return null;
    return entry.body;
  }
}

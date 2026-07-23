import { revalidateTag } from 'next/cache';
import { emitDomainEvent } from '@/data/domain-events/queries';
import type { CronRefreshPricesResponse } from '@/data/market-prices/api-contract';
import {
  PRICES_FRESHNESS_TAG,
  refreshStalePrices,
} from '@/data/market-prices/cache';
import type { CronRouteDeclaration } from '@/db/cron-gate';
import { alertPriceSourceDegradation } from '@/lib/alerts';
import { swallow } from '@/transport/cron';

/**
 * Declares the nightly price backstop as a deliberately lock-free batch; its
 * refresh, degradation event, alert, and cache invalidation remain route-owned.
 */
export const refreshPricesDeclaration: CronRouteDeclaration<CronRefreshPricesResponse> = {
  name: 'cron:prices',
  action: 'cron_prices',
  wakeClass: 'batch',
  record: {
    policy: 'always',
    justification: 'daily batch wakes Neon by design and preserves skipped refresh history',
  },
  lock: {
    mode: 'none',
    justification: 'the sole bulk writer races safely with last-write-wins on-demand refreshes',
  },
  work: async ({ client, record }) => {
    const result = await refreshStalePrices(client);

    if (result.status === 'cached') {
      return {
        outcome: 'skipped',
        workDone: false,
        telemetry: { reason: result.reason },
        body: {
          cached: true,
          lastUpdatedAt: result.lastUpdatedAt?.toISOString() ?? null,
        },
      };
    }

    revalidateTag(PRICES_FRESHNESS_TAG, 'max');

    const { summary } = result;
    const degraded =
      summary.fuzzworkFallbackCount > 0 || summary.budgetExhausted;
    emitDomainEvent({
      eventType: 'price_refresh_finished',
      metadata: {
        outcome: degraded ? 'degraded' : 'completed',
        fetched: summary.fetched,
        written: summary.written,
        esiCount: summary.esiCount,
        fuzzworkFallbackCount: summary.fuzzworkFallbackCount,
        budgetExhausted: summary.budgetExhausted,
        durationMs: summary.durationMs,
      },
    });

    if (degraded) {
      await record('price_source_degraded', {
        caller: 'cron',
        fetched: summary.fetched,
        esiCount: summary.esiCount,
        fuzzworkFallbackCount: summary.fuzzworkFallbackCount,
        budgetExhausted: summary.budgetExhausted,
      });
      await swallow(
        '[cron:prices] degradation alert failed',
        alertPriceSourceDegradation({
          fetched: summary.fetched,
          esiCount: summary.esiCount,
          fuzzworkFallbackCount: summary.fuzzworkFallbackCount,
          budgetExhausted: summary.budgetExhausted,
        }),
      );
    }

    return {
      outcome: 'refreshed',
      workDone: true,
      telemetry: {
        fetched: summary.fetched,
        written: summary.written,
        esiCount: summary.esiCount,
        fuzzworkFallbackCount: summary.fuzzworkFallbackCount,
        budgetExhausted: summary.budgetExhausted,
      },
      body: {
        cached: false,
        lastUpdatedAt: result.lastUpdatedAt.toISOString(),
        fetched: summary.fetched,
        written: summary.written,
      },
    };
  },
};

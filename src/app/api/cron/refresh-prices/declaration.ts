import { revalidateTag } from 'next/cache';
import { emitDomainEvent } from '@/data/domain-events/queries';
import type { CronRefreshPricesResponse } from '@/data/market-prices/api-contract';
import {
  PRICES_FRESHNESS_TAG,
  refreshStalePrices,
} from '@/data/market-prices/cache';
import { readPriceSourceHealth } from '@/data/market-prices/source-health';
import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';
import { alertPriceSourceDegradation } from '@/lib/alerts';
import { bestEffort } from '@/lib/best-effort';

export const refreshPricesDeclaration: CronRouteDeclaration<CronRefreshPricesResponse> = {
  name: 'cron:prices',
  action: 'cron_prices',
  capability: 'cron.refresh-prices',
  wakeClass: 'batch',
  record: {
    policy: 'always',
    justification: 'daily batch wakes Neon by design and preserves skipped refresh history',
  },
  lock: {
    mode: 'none',
    justification: 'the sole bulk writer races safely with last-write-wins on-demand refreshes',
  },
  work: async ({ database, record }) => {
    const result = await refreshStalePrices(database);

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
    const { counts, degraded } = readPriceSourceHealth(summary);
    emitDomainEvent({
      eventType: 'price_refresh_finished',
      metadata: {
        outcome: degraded ? 'degraded' : 'completed',
        ...counts,
        written: summary.written,
        durationMs: summary.durationMs,
      },
    });

    if (degraded) {
      await record('price_source_degraded', { caller: 'cron', ...counts });
      await bestEffort('cron:prices', 'degradation alert', null, () =>
        alertPriceSourceDegradation(counts),
      );
    }

    return {
      outcome: 'refreshed',
      workDone: true,
      telemetry: { ...counts, written: summary.written },
      body: {
        cached: false,
        lastUpdatedAt: result.lastUpdatedAt.toISOString(),
        fetched: summary.fetched,
        written: summary.written,
      },
    };
  },
};

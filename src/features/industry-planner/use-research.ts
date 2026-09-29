'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRefreshOnView } from '@/data/market-prices/use-refresh-on-view';
import { useTypeNames } from '@/data/eve-data/use-type-names';
import { apiFetch } from '@/transport/api-client';
import { CHART_DAYS, type ResearchAssumptions, type ResearchInsight, researchInsight } from './research-insight';
import { type ResearchItem, researchEndpoint } from './api-contract';
import type { RecentBlueprint } from './recent-blueprints';

// Two extra weeks let the 30-day averages fill before the chart starts.
const SERIES_DAYS = CHART_DAYS + 14;

function useResearchItems(blueprintIds: number[]): Map<number, ResearchItem> | null {
  const [items, setItems] = useState<Map<number, ResearchItem> | null>(null);
  const key = blueprintIds.join(',');
  useEffect(() => {
    if (key === '') return;
    const controller = new AbortController();
    (async () => {
      try {
        const result = await apiFetch(researchEndpoint, {
          body: { blueprintTypeIds: key.split(',').map(Number), seriesDays: SERIES_DAYS },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!result.ok || controller.signal.aborted) return;
        setItems(new Map(result.data.items.map((item) => [item.blueprintTypeId, item])));
      } catch {
        if (!controller.signal.aborted) setItems(new Map());
      }
    })();
    return () => controller.abort();
  }, [key]);
  return key === '' ? new Map() : items;
}

/**
 * Live Jita prices, history and build economics for every watched product,
 * read into insights under the chosen assumptions. The list is read once per
 * set of ids, so key the caller by the watched ids.
 */
export function useResearchInsights(
  entries: readonly RecentBlueprint[],
  assumptions: ResearchAssumptions,
): { insights: ResearchInsight[]; loading: boolean } {
  const productIds = useMemo(() => entries.map((entry) => entry.productTypeId), [entries]);
  const blueprintIds = useMemo(() => entries.map((entry) => entry.typeId), [entries]);
  const { prices, refreshing } = useRefreshOnView(productIds, { enabled: productIds.length > 0 });
  const items = useResearchItems(blueprintIds);
  const names = useTypeNames(productIds);

  const insights = useMemo(
    () =>
      entries.map((entry) => {
        const item = items?.get(entry.typeId);
        return researchInsight(
          {
            entry,
            name: names[String(entry.productTypeId)] ?? entry.name,
            price: refreshing && prices.size === 0 ? undefined : (prices.get(entry.productTypeId) ?? nullPrice),
            history: item?.history,
            series: items === null ? undefined : (item?.series ?? []),
            economics: item?.economics,
          },
          assumptions,
        );
      }),
    [entries, items, names, prices, refreshing, assumptions],
  );
  return { insights, loading: items === null || (refreshing && prices.size === 0) };
}

const nullPrice = { bestBuy: null, bestSell: null, buyDepth: null, sellDepth: null };

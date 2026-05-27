import { getTypesByIds } from '@/data/eve-data/queries';
import { getPrices } from '@/data/market-prices/queries';
import type { SiteDetail, SiteResource } from './types';

// Overlays live Jita 5%-percentile buy values onto a list of sites.
//
// Strategy:
// - Collect every non-null typeId across all sites' resources.
// - Batch-fetch market prices and SDE volumes (parallel, one round-trip each).
// - For each resource: liveIsk = round(units × pct5Buy). The Sheet stores
//   `units` as the raw EVE unit count, and compressed-market prices are
//   per-unit (1 compressed unit = 1 raw unit equivalent for the ores and
//   gases this app cares about), so the formula needs no volume conversion.
//   `type.volume` is read but is not part of the formula — it's retained as
//   a sanity gate (skip the live overlay when the SDE row is missing).
// - effectiveIsk = liveIsk ?? totalIsk per row.
// - At the site level, resourceValueIsk is recomputed as sum(effectiveIsk)
//   when the site has resources — keeps the header total and the footer
//   total derived from the same source. Sites with no resources are passed
//   through unchanged.
//
// Pure — does not mutate the input array or its members.
export async function overlayLivePrices(sites: SiteDetail[]): Promise<SiteDetail[]> {
  const allTypeIds = new Set<number>();
  for (const s of sites) {
    for (const r of s.resources) {
      if (r.typeId != null) allTypeIds.add(r.typeId);
    }
  }
  if (allTypeIds.size === 0) return sites;

  const typeIdList = [...allTypeIds];
  const [prices, types] = await Promise.all([
    getPrices(typeIdList),
    getTypesByIds(typeIdList),
  ]);
  const typeById = new Map(types.map((t) => [t.id, t]));

  return sites.map((site) => {
    if (site.resources.length === 0) return site;

    const newResources: SiteResource[] = site.resources.map((r) => {
      const liveIsk = computeLiveIsk(r, prices, typeById);
      const effectiveIsk = liveIsk ?? r.totalIsk;
      return { ...r, liveIsk, effectiveIsk };
    });
    const newResourceValueIsk = newResources.reduce(
      (sum, r) => sum + (r.effectiveIsk ?? 0),
      0,
    );

    return {
      ...site,
      resources: newResources,
      resourceValueIsk: newResourceValueIsk,
    };
  });
}

function computeLiveIsk(
  r: SiteResource,
  prices: Map<number, { pct5Buy: number | null }>,
  typeById: Map<number, { volume: number | null }>,
): number | null {
  if (r.typeId == null) return null;
  const price = prices.get(r.typeId);
  const type = typeById.get(r.typeId);
  if (!price?.pct5Buy || !type?.volume) return null;
  if (r.units == null || r.units <= 0) return null;
  return Math.round(r.units * price.pct5Buy);
}

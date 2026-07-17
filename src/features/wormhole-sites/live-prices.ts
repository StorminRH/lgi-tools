import { getTypesByIds } from '@/data/eve-data/queries';
import { getPrices } from '@/data/market-prices/queries';
import { liveIskFor } from './live-isk';
import type { SiteDetail, SiteResource } from './types';

/**
 * Overlays live Jita 5%-percentile buy values onto a list of sites.
 *
 * Strategy:
 * - Collect every non-null typeId across all sites' resources.
 * - Batch-fetch market prices and SDE volumes (parallel, one round-trip each).
 * - For each resource: liveIsk = round(units × pct5Buy). The Sheet stores
 *   `units` as the raw EVE unit count, and compressed-market prices are
 *   per-unit (1 compressed unit = 1 raw unit equivalent for the ores and
 *   gases this app cares about), so the formula needs no volume conversion.
 *   `type.volume` is read but is not part of the formula — it's retained as
 *   a sanity gate (skip the live overlay when the SDE row is missing).
 * - effectiveIsk = liveIsk ?? totalIsk per row.
 * - At the site level, resourceValueIsk is recomputed as sum(effectiveIsk)
 *   when the site has resources — keeps the header total and the footer
 *   total derived from the same source. Sites with no resources are passed
 *   through unchanged.
 *
 * Pure — does not mutate the input array or its members.
 */
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
      const liveEligible = isLiveEligible(r, typeById);
      const liveIsk = liveEligible
        ? liveIskFor(r.units, prices.get(r.typeId!)?.pct5Buy ?? null)
        : null;
      const effectiveIsk = liveIsk ?? r.totalIsk;
      return { ...r, liveIsk, effectiveIsk, liveEligible };
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

// Whether a resource can take a live value: a resolved typeId, a positive unit
// count, and a present SDE volume (the sanity gate — skip the overlay when the
// SDE row is missing). The same conditions gate the client island, which is fed
// this verdict because the refresh API doesn't return SDE volume.
function isLiveEligible(
  r: SiteResource,
  typeById: Map<number, { volume: number | null }>,
): boolean {
  if (r.typeId == null) return false;
  if (r.units == null || r.units <= 0) return false;
  return !!typeById.get(r.typeId)?.volume;
}

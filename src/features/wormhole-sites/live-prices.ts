import { getTypesByIds } from '@/data/eve-data/queries';
import { getPrices } from '@/data/market-prices/queries';
import { liveIskFor } from './live-isk';
import type { SiteDetail, SiteResource } from './types';

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
        ? liveIskFor(r.units, prices.get(r.typeId!)?.bestSell ?? null)
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

function isLiveEligible(
  r: SiteResource,
  typeById: Map<number, { volume: number | null }>,
): boolean {
  if (r.typeId == null) return false;
  if (r.units == null || r.units <= 0) return false;
  return !!typeById.get(r.typeId)?.volume;
}

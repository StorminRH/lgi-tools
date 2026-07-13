import type { SiteSearchEntry } from './queries';

const RELATED_SITE_COUNT = 3;

function relationRank(current: SiteSearchEntry, candidate: SiteSearchEntry): number {
  const sameType = candidate.siteType === current.siteType;
  const sameClass =
    current.wormholeClass !== null && candidate.wormholeClass === current.wormholeClass;

  if (sameType && sameClass) return 0;
  if (sameType) return 1;
  if (sameClass) return 2;
  return 3;
}

/**
 * Picks a small, stable related-sites set from the deploy-cached catalogue.
 * Relevance is class/type based; ties rotate forward from the current site in
 * catalogue order so inbound links are distributed instead of concentrating on
 * the first few rows.
 */
export function selectRelatedSites(
  catalogue: SiteSearchEntry[],
  currentId: number,
): SiteSearchEntry[] {
  const currentIndex = catalogue.findIndex((site) => site.id === currentId);
  if (currentIndex < 0) return [];

  const current = catalogue[currentIndex]!;
  return catalogue
    .map((site, index) => ({
      site,
      index,
      rank: relationRank(current, site),
      offset: (index - currentIndex + catalogue.length) % catalogue.length,
    }))
    .filter(({ site }) => site.id !== currentId)
    .sort((a, b) => a.rank - b.rank || a.offset - b.offset)
    .slice(0, RELATED_SITE_COUNT)
    .map(({ site }) => site);
}

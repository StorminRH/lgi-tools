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

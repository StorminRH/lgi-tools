import type { SearchSource } from '@/platform/search';
import { rankFuzzyResults } from '@/platform/search/rank';
import { formatIskCompact } from '@/lib/format/isk';
import type { SiteSearchEntry } from './queries';
import { CLASS_TONE, SITE_TYPE_LABEL } from './components/wormhole-styles';
import { setSiteNameIndex } from './site-name-lookup';
import { primarySiteIsk } from './site-primary-isk';

let SITE_INDEX: SiteSearchEntry[] = [];

export function setSiteSearchIndex(entries: SiteSearchEntry[]): void {
  SITE_INDEX = entries;
  setSiteNameIndex(
    entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      estIsk: primarySiteIsk(entry),
      liveRecipes: entry.liveRecipes ?? [],
    })),
  );
}

function iconTone(entry: SiteSearchEntry): string {
  return entry.wormholeClass ? CLASS_TONE[entry.wormholeClass] : 'neutral';
}

const CLASS_ORDER: Record<string, number> = {
  C1: 0, C2: 1, C3: 2, C4: 3, C5: 4, C6: 5,
};

/** C1 to C6 in order; a site with no class or an unknown one sorts after them. */
function classRank(entry: SiteSearchEntry): number {
  return entry.wormholeClass ? CLASS_ORDER[entry.wormholeClass] ?? 9 : 9;
}

/** Equal matches go by class, then by the richer site first. */
function siteTieBreak(a: SiteSearchEntry, b: SiteSearchEntry): number {
  return classRank(a) - classRank(b) || (primarySiteIsk(b) ?? 0) - (primarySiteIsk(a) ?? 0);
}

export const sitesSearchSource: SearchSource = {
  id: 'sites',
  name: 'Sites',
  limit: 6,
  async search(query) {
    return rankFuzzyResults(
      SITE_INDEX,
      query,
      (entry) => entry.name,
      (entry, match) => ({
        kind: 'site',
        id: `site:${entry.id}`,
        label: entry.name,
        sub: `${SITE_TYPE_LABEL[entry.siteType]} · ${formatIskCompact(primarySiteIsk(entry))}`,
        href: `/sites/${entry.id}`,
        iconText: entry.wormholeClass ?? '—',
        iconTone: iconTone(entry),
        matchIndices: match.matchIndices,
      }),
      { tieBreak: siteTieBreak },
    );
  },
};

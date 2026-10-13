import type { SearchSource } from '@/platform/search';
import { rankFuzzyResults } from '@/platform/search/rank';
import { formatIskCompact } from '@/lib/format/isk';
import type { SiteSearchEntry } from './queries';
import { CLASS_TONE, SITE_TYPE_LABEL } from './components/wormhole-styles';
import { wormholeClassRank } from './site-class';
import { WORMHOLE_CLASSES } from './site-taxonomy';
import { primarySiteIsk } from './site-type';

let SITE_INDEX: SiteSearchEntry[] = [];

/**
 * GlobalSearch is the only writer: it sends the sheet-priced index on every
 * route, so search shows the same ISK on /atlas as everywhere else.
 */
export function setSiteSearchIndex(entries: SiteSearchEntry[]): void {
  SITE_INDEX = entries;
}

function iconTone(entry: SiteSearchEntry): string {
  return entry.wormholeClass ? CLASS_TONE[entry.wormholeClass] : 'neutral';
}

/** C1 to C6 in order; a site with no class sorts after them. */
function classRank(entry: SiteSearchEntry): number {
  return entry.wormholeClass ? wormholeClassRank(entry.wormholeClass) : WORMHOLE_CLASSES.length;
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

import type { SearchResult, SearchSource } from '@/platform/search';
import { fuzzyMatch, type FuzzyMatch } from '@/platform/search/match';
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

export const sitesSearchSource: SearchSource = {
  id: 'sites',
  name: 'Sites',
  limit: 6,
  async search(query) {
    const matches: { entry: SiteSearchEntry; match: FuzzyMatch }[] = [];
    for (const entry of SITE_INDEX) {
      const match = fuzzyMatch(query, entry.name);
      if (match) matches.push({ entry, match });
    }

    matches.sort((a, b) => {
      if (a.match.score !== b.match.score) return b.match.score - a.match.score;
      const ca = a.entry.wormholeClass ? CLASS_ORDER[a.entry.wormholeClass] ?? 9 : 9;
      const cb = b.entry.wormholeClass ? CLASS_ORDER[b.entry.wormholeClass] ?? 9 : 9;
      if (ca !== cb) return ca - cb;
      return (primarySiteIsk(b.entry) ?? 0) - (primarySiteIsk(a.entry) ?? 0);
    });

    return matches.map<SearchResult>(({ entry, match }) => ({
      kind: 'site',
      id: `site:${entry.id}`,
      label: entry.name,
      sub: `${SITE_TYPE_LABEL[entry.siteType]} · ${formatIskCompact(primarySiteIsk(entry))}`,
      href: `/sites/${entry.id}`,
      iconText: entry.wormholeClass ?? '—',
      iconTone: iconTone(entry),
      matchIndices: match.matchIndices,
    }));
  },
};

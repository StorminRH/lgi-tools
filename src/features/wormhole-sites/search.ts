// Sites search source. Reads from a module-scoped site index that
// AppHeaderShell (GlobalSearch) and MapChrome seed once at mount via
// `setSiteSearchIndex()` — keeps the per-keystroke matcher synchronous
// and zero-RPC. The server seed is `getSiteSearchIndex()` (live-priced
// resource totals, same overlay as the site card).

import type { SearchResult, SearchSource } from '@/platform/search';
import { fuzzyMatch, type FuzzyMatch } from '@/platform/search/match';
import { formatIskCompact } from '@/lib/format/isk';
import type { SiteSearchEntry } from './queries';
import { CLASS_TONE, SITE_TYPE_LABEL } from './components/wormhole-styles';
import { setSiteNameIndex } from './site-name-lookup';
import { primarySiteIsk } from './site-primary-isk';

let SITE_INDEX: SiteSearchEntry[] = [];

/** Injects the immutable wormhole-site search catalogue consumed by the registered source. */
export function setSiteSearchIndex(entries: SiteSearchEntry[]): void {
  SITE_INDEX = entries;
  // Exact name→id (+ Est. ISK + live recipes) for scanner site rows shares this seed.
  setSiteNameIndex(
    entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      estIsk: primarySiteIsk(entry),
      liveRecipes: entry.liveRecipes ?? [],
    })),
  );
}

// The result-icon badge colour, as an abstract tone (the render layer maps it to
// tokens). The wormhole-class → tone knowledge stays here in the sites feature.
function iconTone(entry: SiteSearchEntry): string {
  return entry.wormholeClass ? CLASS_TONE[entry.wormholeClass] : 'neutral';
}

const CLASS_ORDER: Record<string, number> = {
  C1: 0, C2: 1, C3: 2, C4: 3, C5: 4, C6: 5,
};

/**
 * Global-search source for sites search source; it owns matching and result mapping while the app
 * layer owns registration.
 */
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

    // Sort by fuzzy score desc, then keep the existing class C1→C6 +
    // primary-ISK desc tiebreaker so equal-score hits still cluster
    // the same way they did before fuzzy matching landed.
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

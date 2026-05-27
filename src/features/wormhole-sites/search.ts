// Sites search source. Reads from a module-scoped site index that
// AppHeaderShell seeds once at mount via `setSiteSearchIndex()` — keeps
// the per-keystroke matcher synchronous and zero-RPC, while the data
// itself is server-rendered from `getSiteSearchIndex()`.

import { registerSearchSource } from '@/data/search';
import type { SearchResult } from '@/data/search';
import { fuzzyMatch, type FuzzyMatch } from '@/data/search/match';
import type { SiteSearchEntry } from './queries';
import { SITE_TYPE_LABEL } from './components/wormhole-styles';

let SITE_INDEX: SiteSearchEntry[] = [];

export function setSiteSearchIndex(entries: SiteSearchEntry[]): void {
  SITE_INDEX = entries;
}

function formatIsk(isk: number | null): string {
  if (isk == null) return '—';
  if (isk >= 1_000_000_000) return `${(isk / 1_000_000_000).toFixed(1)}B`;
  return `${(isk / 1_000_000).toFixed(0)}M`;
}

function iconTone(entry: SiteSearchEntry): string {
  if (entry.wormholeClass) return `cls-${entry.wormholeClass.toLowerCase()}`;
  return 'cls-none';
}

function primaryIsk(entry: SiteSearchEntry): number | null {
  if (entry.siteType === 'combat' || entry.siteType === 'relic' || entry.siteType === 'data') {
    return entry.blueLootIsk;
  }
  return entry.resourceValueIsk;
}

const CLASS_ORDER: Record<string, number> = {
  C1: 0, C2: 1, C3: 2, C4: 3, C5: 4, C6: 5,
};

registerSearchSource({
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
      return (primaryIsk(b.entry) ?? 0) - (primaryIsk(a.entry) ?? 0);
    });

    return matches.map<SearchResult>(({ entry, match }) => ({
      kind: 'site',
      id: `site:${entry.id}`,
      label: entry.name,
      sub: `${SITE_TYPE_LABEL[entry.siteType]} · ${formatIsk(primaryIsk(entry))}`,
      href: `/sites/${entry.id}`,
      iconText: entry.wormholeClass ?? '—',
      iconTone: iconTone(entry),
      matchIndices: match.matchIndices,
    }));
  },
});

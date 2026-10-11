export type AppRouterInstance = {
  push: (href: string) => void;
};

export type SearchImageDescriptor = {
  typeId: number;
  variant: 'icon' | 'render' | 'bp' | 'bpc';
};

export type SearchSession = {
  characterId: number;
};

export type SearchResult = {
  kind: string;
  id: string;
  label: string;
  sub?: string;
  href: string;
  iconText?: string;
  iconTone?: string;
  icon?: SearchImageDescriptor;
  typeId?: number;
  originKind?: string;
  matchIndices?: number[];
  onSelect?: (router: AppRouterInstance) => void;
  disabled?: boolean;
};

export type SearchContext = {
  session: SearchSession | null;
  isAdmin: boolean;
  recents: SearchResult[];
  signal?: AbortSignal;
};

export type SearchSource = {
  id: string;
  name: string;
  search: (query: string, ctx: SearchContext) => Promise<SearchResult[]>;
  limit?: number;
  showOnEmpty?: boolean;
};

/**
 * A source whose search function loads on its first search. `load` brings
 * only the search function; the metadata stays with the caller, so listing
 * the source loads nothing. One load serves every search, a rejected load is
 * tried again by the next search, and a search aborted while it loads rejects
 * with AbortError instead of searching.
 */
export function lazySearchSource(
  meta: Omit<SearchSource, 'search'> & { load: () => Promise<SearchSource['search']> },
): SearchSource {
  let loadPromise: Promise<SearchSource['search']> | null = null;

  return {
    id: meta.id,
    name: meta.name,
    limit: meta.limit,
    showOnEmpty: meta.showOnEmpty,
    async search(query, ctx) {
      if (!loadPromise) {
        loadPromise = meta.load().catch((err) => {
          loadPromise = null;
          throw err;
        });
      }
      const search = await loadPromise;
      if (ctx.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      return search(query, ctx);
    },
  };
}

export type SearchSection = {
  name: string;
  results: SearchResult[];
};

/**
 * Every source's results for the query, one section per source that found
 * something, in the order of `sources`. Each section holds at most the
 * source's limit (5 by default). An empty query asks only the showOnEmpty
 * sources. A source that fails is logged and left out, and the run rejects
 * with AbortError when its signal has aborted by the time every source settles.
 */
export async function searchAll(
  sources: readonly SearchSource[],
  query: string,
  ctx: SearchContext,
): Promise<SearchSection[]> {
  const trimmed = query.trim();
  const isEmpty = trimmed.length === 0;

  const settled = await Promise.allSettled(
    sources.map(async (s) => {
      if (isEmpty && !s.showOnEmpty) {
        return { name: s.name, results: [] };
      }
      const raw = await s.search(trimmed, ctx);
      return { name: s.name, results: raw.slice(0, s.limit ?? 5) };
    }),
  );

  if (ctx.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const out: SearchSection[] = [];
  for (const [i, r] of settled.entries()) {
    if (r.status === 'fulfilled') {
      if (r.value.results.length > 0) out.push(r.value);
    } else {
      const isAbort = r.reason instanceof DOMException && r.reason.name === 'AbortError';
      if (!isAbort) {
        console.warn(`searchAll: source "${sources[i]!.name}" failed`, r.reason);
      }
    }
  }
  return out;
}

/** One source's results for a form field: no session, no recents. Rejects with AbortError when `signal` has aborted. */
export async function searchOneSource(
  query: string,
  source: SearchSource,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const sections = await searchAll([source], query, { session: null, isAdmin: false, recents: [], signal });
  return sections[0]?.results ?? [];
}

// Cross-source search registry. Slice-agnostic primitive that the in-nav
// GlobalSearch component consumes. Feature slices register their searchable
// surface (sites, tools, commands, future blueprints, etc.) by importing
// `registerSearchSource` and calling it at module load. The registry then
// dispatches a single user query across every registered source in parallel.
//
// Design contract:
//  - Sources are async even when their work is sync, so future large/lazy
//    sources don't break the dispatcher's shape.
//  - Per-source result cap (default 5) bounds the dropdown render cost
//    regardless of source size.
//  - Empty-query branch: only sources with `showOnEmpty: true` (Recent)
//    contribute when the input is empty.
//  - Cancellation: `searchAll` accepts a `signal` on the SearchContext and
//    throws an AbortError if the signal is aborted by the time every
//    source resolves. GlobalSearch wires this to an AbortController per
//    debounced query so a fast typist's earlier in-flight searches don't
//    overwrite their newer results.
//  - Side-effects: rows that need to do something other than navigate
//    expose an `onSelect(router)` callback. The component calls it
//    instead of `router.push(href)`.
//  - Lazy loading: large indexes (e.g. the future Blueprints source) can
//    register via `registerLazySearchSource`, which memoizes the dynamic
//    import so the cost only lands on the user's first matching keystroke.

import type { useRouter } from 'next/navigation';
import type { Session } from '@/features/auth/types';

export type AppRouterInstance = ReturnType<typeof useRouter>;

export type SearchResult = {
  kind: string;
  id: string;
  label: string;
  sub?: string;
  href: string;
  iconText?: string;
  iconTone?: string;
  // Character positions inside `label` that should render highlighted.
  // Empty array or omitted means no highlight. Fuzzy matchers produce
  // non-contiguous indices (e.g. 'ffrd' → [0, 10, 19, 28] in
  // "Forgotten Frontier Recursive Depot").
  matchIndices?: number[];
  // Side-effect handler. When present, fires instead of router.push(href).
  // Use for log-out (fetch + hard reload), log-in (window.location to
  // the OAuth endpoint), or any future row that needs a non-navigation
  // action. `router` is the App Router instance from useRouter().
  onSelect?: (router: AppRouterInstance) => void;
  // True for the cosmetic "coming soon" tool rows. The component renders
  // these dimmed and disables click.
  disabled?: boolean;
};

export type SearchContext = {
  session: Session | null;
  // Precomputed server-side because `isAdmin()` consults the env-only
  // `SUPERADMIN_CHARACTER_ID`. Don't try to recompute on the client.
  isAdmin: boolean;
  recents: SearchResult[];
  // Optional cancellation signal. Sources that do real async work
  // (lazy imports, network fetches) should check `signal.aborted` and
  // bail; sync sources may ignore it. `searchAll` re-checks at the end
  // and throws AbortError if the signal aborted mid-flight.
  signal?: AbortSignal;
};

export type SearchSource = {
  name: string;
  search: (query: string, ctx: SearchContext) => Promise<SearchResult[]>;
  limit?: number;
  showOnEmpty?: boolean;
};

const sources: SearchSource[] = [];

export function registerSearchSource(source: SearchSource): void {
  sources.push(source);
}

// Lazy-loaded source. The `load()` callback runs at most once per
// session — its promise is memoized on first invocation so subsequent
// keystrokes reuse the resolved SearchSource without re-importing the
// underlying module.
//
// Example consumer (lands in 3.0.5 with the Blueprints source):
//
//   registerLazySearchSource({
//     name: 'Blueprints',
//     limit: 6,
//     load: () => import('./blueprints-source').then((m) => m.blueprintsSource),
//   });
//
// The wrapper presents the same SearchSource shape as a static source
// to the dispatcher, so `searchAll` doesn't need to know lazy sources
// exist. The signal check between `await load()` and `await
// resolved.search(...)` means a cancelled query doesn't waste a freshly-
// loaded module's first call.
export function registerLazySearchSource(meta: {
  name: string;
  limit?: number;
  showOnEmpty?: boolean;
  load: () => Promise<SearchSource>;
}): void {
  let loadPromise: Promise<SearchSource> | null = null;

  registerSearchSource({
    name: meta.name,
    limit: meta.limit,
    showOnEmpty: meta.showOnEmpty,
    async search(query, ctx) {
      if (!loadPromise) {
        // Cache the in-flight load on success. On failure (network drop,
        // bad chunk URL) clear the cache so the next keystroke retries
        // — a rejected promise is still truthy, so the naive
        // `if (!loadPromise) loadPromise = meta.load()` would never
        // retry and the source would stay broken for the whole session.
        loadPromise = meta.load().catch((err) => {
          loadPromise = null;
          throw err;
        });
      }
      const resolved = await loadPromise;
      if (ctx.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      return resolved.search(query, ctx);
    },
  });
}

export function listRegisteredSources(): readonly SearchSource[] {
  return sources;
}

export type SearchSection = {
  name: string;
  results: SearchResult[];
};

export async function searchAll(
  query: string,
  ctx: SearchContext,
): Promise<SearchSection[]> {
  const trimmed = query.trim();
  const isEmpty = trimmed.length === 0;

  const settled = await Promise.all(
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

  return settled.filter((s) => s.results.length > 0);
}

// Test-only: clear the source list so each test starts from empty.
// Production code never calls this.
export function __resetSearchSources(): void {
  sources.length = 0;
}

// Cross-source search registry. Slice-agnostic engine that the in-nav
// GlobalSearch component consumes. Each searchable surface (sites, tools,
// commands, blueprints, recents) exports a SearchSource value from its own
// slice; the wiring manifest in ./register-all PULLS those values and
// registers them here — composition above the slices (the src/db/sde-pipeline.ts
// pattern), so no slice has to reach across a boundary to register itself. The
// registry then dispatches a single user query across every registered source
// in parallel.
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
//  - Lazy loading: large indexes (e.g. the Blueprints source) are registered
//    via `registerLazySearchSource`, which memoizes the dynamic import so the
//    cost only lands on the user's first matching keystroke.
//  - Scoping: `searchAll` optionally takes a subset of source ids so an
//    embedded consumer (a feature-level picker) can query just its sources
//    through the same engine. Omitting the subset queries everything — the
//    global command bar's full-scope behavior is the unchanged default.
//  - Default-scope exclusion: a source with `excludeFromDefaultScope` is
//    reachable ONLY via an explicit scope — the unscoped dispatch skips it.
//    For sources whose rows have no real navigation target yet (systems):
//    the command bar never sees them, embedded pickers query them by id.

import type { useRouter } from 'next/navigation';
import type { EveImageDescriptor } from '@/data/eve-data/type-images';
import type { Session } from '@/features/auth/types';

/**
 * Minimal navigation port required by global search so sources can navigate without depending on
 * the full Next.js router.
 */
export type AppRouterInstance = ReturnType<typeof useRouter>;

/**
 * One display-ready global-search result with stable source identity, score, matched indexes, and
 * navigation action.
 */
export type SearchResult = {
  kind: string;
  id: string;
  label: string;
  sub?: string;
  href: string;
  iconText?: string;
  iconTone?: string;
  // Resolved type-image descriptor set only by sources whose rows map to a
  // specific EVE image. Takes precedence over typeId when both are present.
  icon?: EveImageDescriptor;
  // EVE product/type identity retained for ranking and search-recents
  // compatibility. When icon is absent, the dropdown renders this type's item
  // icon; when both are absent, it shows the iconText glyph.
  typeId?: number;
  // Only set on rows produced by `readRecents()` — preserves the source
  // `kind` from before the row was relabeled to `kind: 'recent'`, so the
  // dropdown can re-tone or future cleanup can filter by origin.
  originKind?: string;
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

/** Runtime context supplied to search sources, including navigation and any shared catalogue data. */
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

/**
 * Pluggable search-source contract pairing a unique name with a query function over the shared
 * search context.
 */
export type SearchSource = {
  // Stable machine identity, the key scoped queries filter on. Distinct from
  // `name`, which is display copy (the dropdown section header) — retitling a
  // section must never break a scoped caller.
  id: string;
  name: string;
  search: (query: string, ctx: SearchContext) => Promise<SearchResult[]>;
  limit?: number;
  showOnEmpty?: boolean;
  // Skipped by the unscoped (default) dispatch; only an explicit `sourceIds`
  // scope reaches this source. For rows with no real navigation target —
  // `href` is required, so a source registers excluded until its rows have
  // somewhere to go.
  excludeFromDefaultScope?: boolean;
};

/**
 * Descriptor for a lazily-loaded source. Same metadata as a SearchSource
 * minus the matcher, which arrives via the memoized `load()` import. The
 * industry-planner Blueprints source exports one of these for the manifest
 * to hand to `registerLazySearchSource`.
 */
export type LazySearchSource = {
  id: string;
  name: string;
  limit?: number;
  showOnEmpty?: boolean;
  excludeFromDefaultScope?: boolean;
  load: () => Promise<SearchSource>;
};

const sources: SearchSource[] = [];

/**
 * Registers one uniquely named global-search source and rejects duplicate names to keep search
 * composition deterministic.
 */
export function registerSearchSource(source: SearchSource): void {
  // A duplicated id would double-dispatch under a scoped query, so surface
  // the registration mistake the moment it happens instead of at review
  // time. Error-and-continue (matching the dispatcher's non-fatal warn
  // posture): the registry still holds what the manifest actually
  // registered, and the equivalence suite pins the known manifest's ids.
  if (sources.some((s) => s.id === source.id)) {
    console.error(`registerSearchSource: duplicate source id "${source.id}"`);
  }
  sources.push(source);
}

/**
 * Lazy-loaded source. The `load()` callback runs at most once per
 * session — its promise is memoized on first invocation so subsequent
 * keystrokes reuse the resolved SearchSource without re-importing the
 * underlying module.
 *
 * Example consumer (see src/features/industry-planner/search.ts): the feature
 * slice exports a LazySearchSource descriptor and the wiring manifest registers
 * it from above —
 *
 *   // in the slice:
 *   export const blueprintsSearchSource: LazySearchSource = \{
 *     id: 'blueprints',
 *     name: 'Blueprints',
 *     limit: 6,
 *     load: () =\> import('./blueprints-source').then((m) =\> m.blueprintsSource),
 *   \};
 *
 *   // in src/search/register-all.ts:
 *   registerLazySearchSource(blueprintsSearchSource);
 *
 * The wrapper presents the same SearchSource shape as a static source
 * to the dispatcher, so `searchAll` doesn't need to know lazy sources
 * exist. The signal check between `await load()` and `await`
 * `resolved.search(...)` means a cancelled query doesn't waste a freshly-
 * loaded module's first call.
 */
export function registerLazySearchSource(meta: LazySearchSource): void {
  let loadPromise: Promise<SearchSource> | null = null;

  registerSearchSource({
    // The wrapper's metadata wins over the loaded source's (same as `name`
    // and `limit` today) — the loaded module restates them only to satisfy
    // the SearchSource shape.
    id: meta.id,
    name: meta.name,
    limit: meta.limit,
    showOnEmpty: meta.showOnEmpty,
    excludeFromDefaultScope: meta.excludeFromDefaultScope,
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

/**
 * Returns search sources in registration order as a defensive copy that callers cannot use to
 * mutate the registry.
 */
export function listRegisteredSources(): readonly SearchSource[] {
  return sources;
}

/** Grouped global-search results for one registered source in deterministic display order. */
export type SearchSection = {
  name: string;
  results: SearchResult[];
};

/**
 * `sourceIds` scopes the query to a subset of registered sources:
 *  - omitted/undefined → every registered source (the global command bar's
 *    full-scope behavior, unchanged);
 *  - an id subset → only those sources run, each with its own ranking and
 *    limit exactly as at full scope;
 *  - an empty array → no sources, resolves to [];
 *  - an unknown id simply matches nothing (no warning).
 * Section order stays registration order regardless of `sourceIds` order.
 */
export async function searchAll(
  query: string,
  ctx: SearchContext,
  sourceIds?: readonly string[],
): Promise<SearchSection[]> {
  const trimmed = query.trim();
  const isEmpty = trimmed.length === 0;

  // When unscoped, the default path runs every source that hasn't opted out
  // via `excludeFromDefaultScope` — behaviorally identical to the pre-flag
  // engine for the global command bar, since only picker-scoped sources
  // (systems) opt out.
  const active = sourceIds === undefined
    ? sources.filter((s) => !s.excludeFromDefaultScope)
    : sources.filter((s) => sourceIds.includes(s.id));

  // Promise.allSettled (not Promise.all) so one source's failure — e.g. a
  // transient network error inside a lazy source's `await import()` —
  // doesn't kill the other sources' results for the same keystroke.
  // Rejected sources are dropped from this query; the next keystroke
  // retries them. AbortError still propagates via the signal check below.
  const settled = await Promise.allSettled(
    active.map(async (s) => {
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
      // Filter AbortError out of the warn branch — once async lazy
      // sources exist (3.0.5's Blueprints), a cancelled-mid-flight
      // search() will throw AbortError that Promise.allSettled catches
      // as a rejection. Those are expected cancellations, not real
      // failures; warning on them would spam the console on every
      // keystroke during fast typing.
      const isAbort = r.reason instanceof DOMException && r.reason.name === 'AbortError';
      if (!isAbort) {
        // Index into `active`, not `sources` — under a scoped query the
        // settled array only covers the filtered subset, and indexing the
        // full registry would blame the wrong source.
        // settled.length === active.length (settled = allSettled of active.map), so active[i] exists.
        console.warn(`searchAll: source "${active[i]!.name}" failed`, r.reason);
      }
    }
  }
  return out;
}

/**
 * Test-only: clear the source list so each test starts from empty.
 * Production code never calls this.
 */
export function __resetSearchSources(): void {
  sources.length = 0;
}

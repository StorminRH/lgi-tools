## Search
<!-- updated: 2026-07-12 -->

Search started as a convenience feature and turned into an architectural boundary.

The user-facing problem is simple: LGI.tools has too many surfaces for navigation to depend only on menus. Wormhole sites, blueprints, tools, commands, and recently opened rows all want to be reachable from the keyboard. But the code problem is different. Each searchable thing belongs to a different slice, and I do not want the search box to learn every feature’s schema just so it can show a result.

The first version in [PR #13](https://github.com/StorminRH/lgi-tools/pull/13) was intentionally local: a terminal-style search on `/sites`. It parsed inputs like `c5/relic`, `c2`, or `ore` into the existing site filters. That was the right first move because it did not invent a platform before there was a second consumer. It also set the tone for the later design: the typed command should be a small contract over existing state, not a second filtering system.

[PR #18](https://github.com/StorminRH/lgi-tools/pull/18) made search global. The header search became a Spotlight-style navigator with sources for sites, tools, commands, and recents. That is where the boundary started to matter. A site result is owned by the wormhole-sites feature. A command is owned by the platform. A tool row comes from the tools registry. A recent row comes from local browser storage. The search layer should know how to ask sources for results and render those results. It should not know how a site calculates ISK, how a blueprint resolves its product, or how auth signs a user out.

The current search contract reflects that. A `SearchResult` is a display-and-dispatch shape: kind, stable ID, label, optional subtitle, href, optional icon data, match indices, optional side-effect handler, and disabled state. A `SearchSource` is an async function from query plus context to result rows. Even synchronous sources use the async shape because the large sources were always going to arrive later. The registry caps each source, lets only opt-in sources appear on empty input, accepts a cancellation signal, and keeps side effects behind `onSelect` instead of adding one-off command flags.<sup><a href="#code-search-registry">1</a></sup>

The first structural mistake was where that registry lived. Search originally sat under `src/data`, and sources registered themselves by importing the registry. That worked until the registry had to compose feature sources and data sources at the same time. It created import-rule exceptions just to make search boot. [PR #76](https://github.com/StorminRH/lgi-tools/pull/76) fixed the direction: search moved to top-level `src/search`, above the feature and data slices. Sources now export descriptors. The manifest pulls those descriptors from above and registers them in one place. That inversion removed the search-specific lint exceptions and made the architecture match the intent.<sup><a href="#code-search-manifest">2</a></sup>

There was also a Next.js-specific trap. The registry has to be populated in the client module graph, because the dropdown runs in the client. Importing the manifest from a server component would populate the server’s copy of the module and leave the client registry empty. The shell imports `@/search/register-all` from `AppHeaderShell`, the client coordinator for the interactive header slots. That is a small line of code, but it is load-bearing. It records the fact that server and client module graphs are not one shared singleton.<sup><a href="#code-search-client-graph">3</a></sup>

The header component owns the interactive behavior around that registry. It seeds the sites source with a server-rendered site index, reads recents from localStorage after mount, debounces input, dispatches through `searchAll`, and creates an `AbortController` for each debounced query. When a user types quickly, an older in-flight search should not be allowed to overwrite newer results. That mattered once the blueprint source became lazy-loaded; it matters even more for any future source that has to fetch or import a larger index.<sup><a href="#code-search-global-ui">4</a></sup>

[PR #25](https://github.com/StorminRH/lgi-tools/pull/25) changed the matching model before the blueprint index landed. Exact substring search was fine for a 69-row site catalogue, but not for thousands of blueprints. The repo wrapped `fuzzysort` in one project-shaped helper so every source uses the same score and the same per-character highlight data. The UI renders `matchIndices`, not a single contiguous range, which is why a query like `ffrd` can highlight the individual letters in “Forgotten Frontier Recursive Depot.” That sounds cosmetic, but it is a trust cue. The dropdown should show why it matched something, especially when fuzzy matching returns a result the user did not type contiguously.<sup><a href="#code-search-match">5</a></sup>

The blueprint source is the reason the registry had to be async and lazy. The source descriptor is cheap to register, but the matcher and index do not load until the user actually types something that reaches that source. The index fetch is memoized for the session and deliberately not bound to the first caller’s abort signal; otherwise, one cancelled keystroke could poison the shared index for every later query. Cancellation happens after the await, before the source spends work mapping stale results into the dropdown.<sup><a href="#code-search-blueprint-lazy">6</a></sup>

The site source shows the other side of the design. It does not fetch on every keystroke. The server already has the small site index when it renders the header shell, so the client seeds a module-scoped index once and each search runs synchronously against that list. The result shape is still the same as every other source: label, subtitle, href, icon text, tone, and match indices. The feature owns what a site result means; search owns how it is presented beside other sources.<sup><a href="#code-search-sites-source">7</a></sup>

Commands are the place where I had to avoid another tempting shortcut. Logging out is not navigation. Logging in is not navigation either; it has to start an OAuth flow. The early search command model had special command flags for those cases, but [PR #25](https://github.com/StorminRH/lgi-tools/pull/25) collapsed them into one `onSelect` side-effect contract. A command can still have an `href` for display or fallback, but the result itself owns what happens when it is selected. The command source also gates rows from context: logged-out users see login, logged-in users see logout, admins see admin commands.<sup><a href="#code-search-commands-source">8</a></sup>

Recents are deliberately local and untrusted. They live in localStorage, not the database, because they are a browser convenience. But localStorage can be stale, malformed, or edited by the user. The storage reader validates rows with Zod, caps the list, drops disabled rows, and preserves the original source kind so a recent blueprint can still render like a blueprint. [PR #74](https://github.com/StorminRH/lgi-tools/pull/74) added real item icons to search rows by carrying `typeId` on results that represent an EVE type. The recents path had to preserve that field too, or a recently opened blueprint would fall back to a meaningless text glyph the next time the dropdown opened.<sup><a href="#code-search-recents">9</a></sup><sup><a href="#code-search-icons-storage">10</a></sup>

The lesson from search is that cross-cutting UI needs a composition layer just as much as data pipelines do. It is easy for AI-generated code to bolt a search helper directly into each feature, especially because each helper looks harmless in isolation. The cost appears later, when every source ranks differently, every command dispatches differently, and every feature imports across boundaries to get into the dropdown.

The current rule is cleaner: features and data slices export search sources; `src/search` composes them from above; the header owns interaction; sources own their projection; the matcher is shared; recents are validated; large sources are lazy; side effects go through one contract. Search stays useful because it is centralized where it should be and decentralized where the domain knowledge lives.

<!-- uth:code-excerpts:start -->
<!-- uth:code id="code-search-registry" file="src/search/index.ts" lines="3-29,36-87,130-155,167-211" lang="ts" -->
```ts id="4tw6zn"
// Cross-source search registry. Each searchable surface exports a SearchSource
// from its own slice; the wiring manifest in ./register-all pulls those values
// and registers them here — composition above the slices.
export type SearchResult = {
  kind: string;
  id: string;
  label: string;
  sub?: string;
  href: string;
  iconText?: string;
  iconTone?: string;
  typeId?: number;
  originKind?: string;
  matchIndices?: number[];
  onSelect?: (router: AppRouterInstance) => void;
  disabled?: boolean;
};

export type SearchContext = {
  session: Session | null;
  isAdmin: boolean;
  recents: SearchResult[];
  signal?: AbortSignal;
};

export type SearchSource = {
  name: string;
  search: (query: string, ctx: SearchContext) => Promise<SearchResult[]>;
  limit?: number;
  showOnEmpty?: boolean;
};

export function registerLazySearchSource(meta: LazySearchSource): void {
  let loadPromise: Promise<SearchSource> | null = null;
  registerSearchSource({
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
      const resolved = await loadPromise;
      if (ctx.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return resolved.search(query, ctx);
    },
  });
}

export async function searchAll(query: string, ctx: SearchContext): Promise<SearchSection[]> {
  const trimmed = query.trim();
  const isEmpty = trimmed.length === 0;
  const settled = await Promise.allSettled(
    sources.map(async (s) => {
      if (isEmpty && !s.showOnEmpty) return { name: s.name, results: [] };
      const raw = await s.search(trimmed, ctx);
      return { name: s.name, results: raw.slice(0, s.limit ?? 5) };
    }),
  );
  if (ctx.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return settled.flatMap((r) => r.status === 'fulfilled' && r.value.results.length ? [r.value] : []);
}
```

<!-- uth:code id="code-search-manifest" file="src/search/register-all.ts" lines="3-22" lang="ts" ref="5d16c056340da1fa70ad385dd7bab0b1140f7282" -->
```ts id="bv8c9t"
// Search-source wiring manifest. Lives in the unclassified src/search/ layer
// ABOVE the data and feature slices. Registration order = dropdown section order.
import { registerSearchSource, registerLazySearchSource } from '@/search';
import { recentsSearchSource } from '@/features/search-recents/search';
import { sitesSearchSource } from '@/features/wormhole-sites/search';
import { blueprintsSearchSource } from '@/features/industry-planner/search';
import { toolsSearchSource } from '@/data/tools/search';
import { commandsSearchSource } from '@/data/commands/search';

registerSearchSource(recentsSearchSource);
registerSearchSource(sitesSearchSource);
registerLazySearchSource(blueprintsSearchSource);
registerSearchSource(toolsSearchSource);
registerSearchSource(commandsSearchSource);
```

<!-- uth:code id="code-search-client-graph" file="src/components/AppHeaderShell.tsx" lines="25-30,32-47" lang="tsx" -->
```tsx id="9ypybu"
// Side-effect import: registers every search source on the CLIENT instance
// of the registry. Lives here because Next.js's server + client module graphs
// are separate, and the search dropdown renders client-side.
import '@/search/register-all';

export function AppHeaderShell({ siteIndex, serverStatus }: Props) {
  const [searchActive, setSearchActive] = useState(false);
  return (
    <>
      <GlobalSearch
        active={searchActive}
        onActiveChange={setSearchActive}
        siteIndex={siteIndex}
      />
      {/* other header slots */}
    </>
  );
}
```

<!-- uth:code id="code-search-global-ui" file="src/components/GlobalSearch.tsx" lines="55-98,100-140,197-250" lang="tsx" -->
```tsx id="4q9vhe"
export function GlobalSearch({ active, onActiveChange, siteIndex }: Props) {
  const { session, isAdmin } = useAuth();
  const router = useRouter();
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sections, setSections] = useState<SearchSection[]>([]);
  const [recents, setRecents] = useState<SearchResult[]>([]);

  useEffect(() => setSiteSearchIndex(siteIndex), [siteIndex]);
  useEffect(() => { setRecents(readRecents()); }, []);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [value]);

  useEffect(() => {
    const controller = new AbortController();
    searchAll(debounced, { session, isAdmin, recents, signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setSections(next);
        setActiveIndex(0);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        throw err;
      });
    return () => controller.abort();
  }, [debounced, session, isAdmin, recents]);

  function fireResult(result: SearchResult) {
    if (result.disabled) return;
    pushRecent(result);
    setRecents(readRecents());
    setValue('');
    onActiveChange(false);
    if (result.onSelect) return result.onSelect(router);
    router.push(result.href);
  }

  return sections.map((section) =>
    section.results.map((row) =>
      row.typeId ? <TypeIcon typeId={row.typeId} size={22} /> : <span>{row.iconText}</span>,
    ),
  );
}
```

<!-- uth:code id="code-search-match" file="src/search/match.ts" lines="3-35" lang="ts" -->
```ts id="z8mgck"
// Project-shaped wrapper around fuzzysort. Every search source uses this helper
// for both ranking and per-character match highlighting.
import fuzzysort from 'fuzzysort';

export type FuzzyMatch = {
  score: number;
  matchIndices: number[];
};

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (query.length === 0) return { score: 0, matchIndices: [] };
  const result = fuzzysort.single(query, target);
  if (result === null) return null;
  return {
    score: result.score,
    matchIndices: [...result.indexes],
  };
}
```

<!-- uth:code id="code-search-blueprint-lazy" file="src/features/industry-planner/search.ts, src/features/industry-planner/blueprints-source.ts" lines="3-15,19-39,42-71" lang="ts" -->
```ts id="q42y6k"
// search.ts — cheap descriptor registered by the manifest.
export const blueprintsSearchSource: LazySearchSource = {
  name: 'Blueprints',
  limit: 6,
  load: () => import('./blueprints-source').then((m) => m.blueprintsSource),
};

// blueprints-source.ts — loaded only on the first blueprint keystroke.
let indexPromise: Promise<BlueprintIndexEntry[]> | null = null;

function loadIndex(): Promise<BlueprintIndexEntry[]> {
  if (!indexPromise) {
    indexPromise = apiFetch(blueprintsEndpoint)
      .then((result) => {
        if (!result.ok) throw new Error(`blueprint index ${result.status}`);
        return result.data.blueprints;
      })
      .catch((err) => {
        indexPromise = null;
        throw err;
      });
  }
  return indexPromise;
}

export const blueprintsSource: SearchSource = {
  name: 'Blueprints',
  limit: 6,
  async search(query, ctx) {
    if (query.length === 0) return [];
    const index = await loadIndex();
    if (ctx.signal?.aborted) return [];
    return index.flatMap((entry) => {
      const match = fuzzyMatch(query, entry.name);
      return match ? [{ kind: 'blueprint', id: `blueprint:${entry.blueprintTypeId}`, label: entry.name, href: `/industry/${entry.blueprintTypeId}`, typeId: entry.productTypeId, matchIndices: match.matchIndices }] : [];
    });
  },
};
```

<!-- uth:code id="code-search-sites-source" file="src/features/wormhole-sites/search.ts" lines="3-18,36-67" lang="ts" -->
```ts id="2ab0q1"
// Sites search source. Reads from a module-scoped site index that
// AppHeaderShell seeds once at mount via setSiteSearchIndex().
let SITE_INDEX: SiteSearchEntry[] = [];

export function setSiteSearchIndex(entries: SiteSearchEntry[]): void {
  SITE_INDEX = entries;
}

export const sitesSearchSource: SearchSource = {
  name: 'Sites',
  limit: 6,
  async search(query) {
    const matches: { entry: SiteSearchEntry; match: FuzzyMatch }[] = [];
    for (const entry of SITE_INDEX) {
      const match = fuzzyMatch(query, entry.name);
      if (match) matches.push({ entry, match });
    }
    matches.sort((a, b) => b.match.score - a.match.score);
    return matches.map<SearchResult>(({ entry, match }) => ({
      kind: 'site',
      id: `site:${entry.id}`,
      label: entry.name,
      sub: `${SITE_TYPE_LABEL[entry.siteType]} · ${formatIskCompact(primaryIsk(entry))}`,
      href: `/sites/${entry.id}`,
      iconText: entry.wormholeClass ?? '—',
      iconTone: iconTone(entry),
      matchIndices: match.matchIndices,
    }));
  },
};
```

<!-- uth:code id="code-search-commands-source" file="src/data/commands/search.ts" lines="3-17,34-107,111-134" lang="ts" -->
```ts id="nqnqfa"
// Commands search source. Rows with side effects use onSelect(router) instead
// of href-driven navigation.
const COMMANDS: CommandEntry[] = [
  { id: 'cmd:open-changelog', label: 'Open changelog', href: '/changelog', iconText: '→', visible: () => true },
  { id: 'cmd:open-admin', label: 'Open admin', href: '/admin', iconText: '→', visible: (ctx) => ctx.isAdmin },
  {
    id: 'cmd:logout',
    label: 'Log out',
    href: '/',
    iconText: '⏏',
    onSelect: () => {
      void apiFetch(signOutEndpoint, { body: {} }).then((result) => {
        if (result.ok) window.location.href = '/';
      });
    },
    visible: (ctx) => ctx.session !== null,
  },
  {
    id: 'cmd:login',
    label: 'Log in with EVE',
    href: '/',
    iconText: '↪',
    onSelect: () => {
      void apiFetch(signInOauth2Endpoint, { body: { providerId: 'eve', callbackURL: '/' } })
        .then((result) => {
          if (result.ok && result.data.url) window.location.href = result.data.url;
        });
    },
    visible: (ctx) => ctx.session === null,
  },
];

export const commandsSearchSource: SearchSource = {
  name: 'Commands',
  limit: 5,
  async search(query, ctx) {
    return COMMANDS.filter((c) => c.visible(ctx)).flatMap((cmd) => {
      const match = fuzzyMatch(query, cmd.label);
      return match ? [{ kind: 'command', id: cmd.id, label: cmd.label, href: cmd.href, iconText: cmd.iconText, onSelect: cmd.onSelect, matchIndices: match.matchIndices }] : [];
    });
  },
};
```

<!-- uth:code id="code-search-recents" file="src/features/search-recents/search.ts" lines="3-34" lang="ts" -->
```ts id="59trve"
// Recent search source. The ONLY source that opts into showOnEmpty: true.
export const recentsSearchSource: SearchSource = {
  name: 'Recent',
  limit: 5,
  showOnEmpty: true,
  async search(query, ctx) {
    if (query.length === 0) {
      return ctx.recents.map<SearchResult>((r) => ({ ...r, matchIndices: [] }));
    }
    const matched = ctx.recents
      .map((r) => ({ row: r, match: fuzzyMatch(query, r.label) }))
      .filter((entry): entry is { row: SearchResult; match: NonNullable<typeof entry.match> } => entry.match !== null);
    matched.sort((a, b) => b.match.score - a.match.score);
    return matched.map<SearchResult>(({ row, match }) => ({ ...row, matchIndices: match.matchIndices }));
  },
};
```

<!-- uth:code id="code-search-icons-storage" file="src/features/search-recents/storage.ts" lines="13-38,49-58,60-91,99-117" lang="ts" -->
```ts id="ire6pg"
// What gets persisted is a thin subset of SearchResult. typeId is kept so a
// recent row that maps to an EVE type still renders its icon.
type StoredRecent = Pick<
  SearchResult,
  'kind' | 'id' | 'label' | 'sub' | 'href' | 'iconText' | 'iconTone' | 'typeId'
>;

const storedRecentSchema = z.object({
  kind: z.string(),
  id: z.string(),
  label: z.string(),
  sub: z.string().optional(),
  href: z.string(),
  iconText: z.string().optional(),
  iconTone: z.string().optional(),
  typeId: z.number().optional(),
});

const ITEM_KINDS = new Set(['blueprint']);
function rendersIcon(r: StoredRecent): boolean {
  return !ITEM_KINDS.has(r.kind) || r.typeId != null;
}

export function pushRecent(result: SearchResult): void {
  if (result.kind === 'recent') return;
  if (result.disabled) return;
  const current = readStored();
  const without = current.filter((r) => r.id !== result.id);
  const next: StoredRecent[] = [{ kind: result.kind, id: result.id, label: result.label, href: result.href, typeId: result.typeId }, ...without].slice(0, MAX_RECENTS);
  store.setItem(STORAGE_KEY, JSON.stringify(next));
}

function readStored(): StoredRecent[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isStoredRecent).filter(rendersIcon);
}

function isStoredRecent(value: unknown): value is StoredRecent {
  return storedRecentSchema.safeParse(value).success;
}
```
<!-- uth:code-excerpts:end -->

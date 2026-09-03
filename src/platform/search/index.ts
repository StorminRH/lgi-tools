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
  excludeFromDefaultScope?: boolean;
};

export type LazySearchSource = {
  id: string;
  name: string;
  limit?: number;
  showOnEmpty?: boolean;
  excludeFromDefaultScope?: boolean;
  load: () => Promise<SearchSource>;
};

const sources: SearchSource[] = [];

export function registerSearchSource(source: SearchSource): void {
  if (sources.some((s) => s.id === source.id)) {
    console.error(`registerSearchSource: duplicate source id "${source.id}"`);
  }
  sources.push(source);
}

export function registerLazySearchSource(meta: LazySearchSource): void {
  let loadPromise: Promise<SearchSource> | null = null;

  registerSearchSource({
    id: meta.id,
    name: meta.name,
    limit: meta.limit,
    showOnEmpty: meta.showOnEmpty,
    excludeFromDefaultScope: meta.excludeFromDefaultScope,
    async search(query, ctx) {
      if (!loadPromise) {
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
  sourceIds?: readonly string[],
): Promise<SearchSection[]> {
  const trimmed = query.trim();
  const isEmpty = trimmed.length === 0;

  const active = sourceIds === undefined
    ? sources.filter((s) => !s.excludeFromDefaultScope)
    : sources.filter((s) => sourceIds.includes(s.id));

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
      const isAbort = r.reason instanceof DOMException && r.reason.name === 'AbortError';
      if (!isAbort) {
        console.warn(`searchAll: source "${active[i]!.name}" failed`, r.reason);
      }
    }
  }
  return out;
}

export function __resetSearchSources(): void {
  sources.length = 0;
}

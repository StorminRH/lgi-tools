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

import type { Session } from '@/features/auth/types';

export type SearchResult = {
  kind: string;
  id: string;
  label: string;
  sub?: string;
  href: string;
  iconText?: string;
  iconTone?: string;
  // Highlighted substring inside `label`; the component renders the
  // [start, end) slice in green. Optional — sources without
  // substring-matching semantics omit it.
  matchRange?: [number, number];
  // Discriminator for command-with-side-effect rows. The component
  // checks this and routes to its handler instead of href navigation.
  command?: 'logout' | 'login' | 'refresh-prices' | null;
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

  return settled.filter((s) => s.results.length > 0);
}

// Test-only: clear the source list so each test starts from empty.
// Production code never calls this.
export function __resetSearchSources(): void {
  sources.length = 0;
}

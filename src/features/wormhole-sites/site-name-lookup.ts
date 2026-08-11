/**
 * Exact name → catalogue id for scanned site rows. Built from the same
 * deploy-static catalogue the global search index seeds; null means no row
 * affordance.
 */

let BY_NAME: ReadonlyMap<string, number> = new Map();

/**
 * Rebuilds the exact name→id map from catalogue entries. Call alongside the
 * search-index seed so scanner affordances and global search share one source.
 */
export function setSiteNameIndex(
  entries: readonly { readonly id: number; readonly name: string }[],
): void {
  BY_NAME = new Map(entries.map((entry) => [entry.name, entry.id]));
}

/**
 * Resolves a scanned site name to its catalogue id; null when the catalogue
 * has no such site.
 */
export function siteIdForSiteName(name: string): number | null {
  return BY_NAME.get(name) ?? null;
}

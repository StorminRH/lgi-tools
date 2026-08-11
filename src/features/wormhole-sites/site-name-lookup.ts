/**
 * Exact name → catalogue id (headline Est. ISK + live harvestable recipes)
 * for scanned site rows. Built from the same deploy-static catalogue the
 * global search index seeds; null id means no row affordance.
 */

/** One live-eligible harvestable resource carried on the scanner name index. */
export type SiteLiveRecipe = {
  readonly typeId: number;
  readonly units: number;
  /** Priced-catalogue seed for this resource (effectiveIsk). */
  readonly seedIsk: number | null;
};

type SiteNameRecord = {
  readonly id: number;
  readonly estIsk: number | null;
  readonly liveRecipes: readonly SiteLiveRecipe[];
};

let BY_NAME: ReadonlyMap<string, SiteNameRecord> = new Map();

/** One catalogue row used to seed scanner name→id and Est. ISK lookups. */
export type SiteNameIndexEntry = {
  readonly id: number;
  readonly name: string;
  /** Catalogue headline ISK; omitted entries store null. */
  readonly estIsk?: number | null;
  /** Live-eligible resources for harvestable scanner refresh; omitted → []. */
  readonly liveRecipes?: readonly SiteLiveRecipe[];
};

/**
 * Rebuilds the exact name→id map from catalogue entries. Call alongside the
 * search-index seed so scanner affordances and global search share one source.
 */
export function setSiteNameIndex(entries: readonly SiteNameIndexEntry[]): void {
  BY_NAME = new Map(
    entries.map((entry) => [
      entry.name,
      {
        id: entry.id,
        estIsk: entry.estIsk ?? null,
        liveRecipes: entry.liveRecipes ?? [],
      },
    ]),
  );
}

/**
 * Resolves a scanned site name to its catalogue id; null when the catalogue
 * has no such site.
 */
export function siteIdForSiteName(name: string): number | null {
  return BY_NAME.get(name)?.id ?? null;
}

/**
 * Catalogue headline Est. ISK for a scanned site name; null when the name
 * misses the catalogue or the sheet has no value.
 */
export function siteEstIskForSiteName(name: string): number | null {
  return BY_NAME.get(name)?.estIsk ?? null;
}

/**
 * Live-eligible harvestable recipes for a scanned site name; empty when the
 * name misses the catalogue or the site has no live-priced resources.
 */
export function siteLiveRecipesForSiteName(name: string): readonly SiteLiveRecipe[] {
  return BY_NAME.get(name)?.liveRecipes ?? [];
}

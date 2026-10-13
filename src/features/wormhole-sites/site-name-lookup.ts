import type { SiteType } from './site-taxonomy';
import { primarySiteIsk } from './site-type';

const SITE_NAME_ALIASES: readonly (readonly [string, string])[] = [
  ['Ordinary Permiter Deposit', 'Ordinary Perimeter Deposit'],
];

function siteNameIndexKeys(name: string): readonly string[] {
  const keys = [name];
  for (const [typo, eve] of SITE_NAME_ALIASES) {
    if (name === typo) keys.push(eve);
    else if (name === eve) keys.push(typo);
  }
  return keys;
}

export type SiteLiveRecipe = {
  readonly typeId: number;
  readonly units: number;
  readonly seedIsk: number | null;
};

/**
 * The fields of a site index entry the name lookups read. It is declared
 * here rather than taken from SiteSearchEntry because queries.ts imports
 * SiteLiveRecipe from this module.
 */
export type SiteCatalogueEntry = {
  readonly id: number;
  readonly name: string;
  readonly siteType: SiteType;
  readonly blueLootIsk: number | null;
  readonly resourceValueIsk: number | null;
  readonly liveRecipes?: readonly SiteLiveRecipe[];
};

export type SiteCatalogueLookups = {
  readonly siteIdForName: (name: string) => number | null;
  readonly estIskForName: (name: string) => number | null;
  readonly liveRecipesForName: (name: string) => readonly SiteLiveRecipe[];
};

/**
 * Resolves scanner site names against one site index. A name matches its
 * catalogue spelling or a known typo of it; a name with no site reads as
 * null or no recipes.
 */
export function createSiteNameLookups(
  entries: readonly SiteCatalogueEntry[],
): SiteCatalogueLookups {
  const byName = new Map<string, SiteCatalogueEntry>();
  for (const entry of entries) {
    for (const key of siteNameIndexKeys(entry.name)) {
      byName.set(key, entry);
    }
  }
  return {
    siteIdForName: (name) => byName.get(name)?.id ?? null,
    estIskForName: (name) => {
      const entry = byName.get(name);
      return entry === undefined ? null : primarySiteIsk(entry);
    },
    liveRecipesForName: (name) => byName.get(name)?.liveRecipes ?? [],
  };
}

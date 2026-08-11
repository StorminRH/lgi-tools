/**
 * Compact live-recipe shaping for the search/scanner catalogue seed.
 * Kept DB-free so Vitest and the client name-index share one owner.
 */

import type { SiteLiveRecipe } from './site-name-lookup';
import type { SiteResource } from './types';

/** Picks live-eligible resources into the compact scanner/search seed shape. */
export function liveRecipesForSearch(
  resources: readonly SiteResource[],
): SiteLiveRecipe[] {
  const recipes: SiteLiveRecipe[] = [];
  for (const resource of resources) {
    if (!resource.liveEligible || resource.typeId == null) continue;
    if (resource.units == null || resource.units <= 0) continue;
    recipes.push({
      typeId: resource.typeId,
      units: resource.units,
      seedIsk: resource.effectiveIsk,
    });
  }
  return recipes;
}

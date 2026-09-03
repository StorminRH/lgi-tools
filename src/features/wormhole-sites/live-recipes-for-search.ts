import type { SiteLiveRecipe } from './site-name-lookup';
import type { SiteResource } from './types';

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

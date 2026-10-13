import { isLivePricedResource } from './live-isk';
import type { SiteLiveRecipe } from './site-name-lookup';
import type { SiteResource } from './types';

export function liveRecipesForSearch(
  resources: readonly SiteResource[],
): SiteLiveRecipe[] {
  return resources.filter(isLivePricedResource).map((resource) => ({
    typeId: resource.typeId,
    units: resource.units,
    seedIsk: resource.effectiveIsk,
  }));
}

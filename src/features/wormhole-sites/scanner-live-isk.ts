/**
 * Pure Est. ISK math for scanner harvestable rows — shared by the live cell
 * and its focused tests so the provider UI stays thin.
 */

import { liveIskFor } from './live-isk';
import type { SiteLiveRecipe } from './site-name-lookup';

/** One recipe's ISK given a live buy price, falling back to its catalogue seed. */
export function recipeLiveIsk(
  recipe: SiteLiveRecipe,
  pct5Buy: number | null | undefined,
): number | null {
  return liveIskFor(recipe.units, pct5Buy ?? null) ?? recipe.seedIsk;
}

/**
 * Sums live (or seed) ISK across recipes and reports whether any type is still
 * awaiting confirmation. Empty recipes → null total / not pending.
 */
export function scannerLiveEstIsk(
  recipes: readonly SiteLiveRecipe[],
  priceOf: (typeId: number) => { pct5Buy: number | null } | undefined,
  isPending: (typeId: number) => boolean,
): { readonly total: number | null; readonly pending: boolean } {
  if (recipes.length === 0) {
    return { total: null, pending: false };
  }
  let total = 0;
  let pending = false;
  for (const recipe of recipes) {
    total += recipeLiveIsk(recipe, priceOf(recipe.typeId)?.pct5Buy) ?? 0;
    if (isPending(recipe.typeId)) pending = true;
  }
  return { total, pending };
}

/** Sorted unique type-id key so a provider remount tracks set membership. */
export function scannerLiveTypeIdKey(typeIds: readonly number[]): string {
  return [...new Set(typeIds)].sort((a, b) => a - b).join(',');
}

/** Collects unique type IDs from live recipes for named harvestable sites. */
export function scannerLiveTypeIdsForNames(
  names: readonly string[],
  recipesForName: (name: string) => readonly SiteLiveRecipe[],
): number[] {
  const ids = new Set<number>();
  for (const name of names) {
    for (const recipe of recipesForName(name)) {
      ids.add(recipe.typeId);
    }
  }
  return [...ids];
}

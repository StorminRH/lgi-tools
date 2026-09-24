import { liveIskFor } from './live-isk';
import type { SiteLiveRecipe } from './site-name-lookup';

export function recipeLiveIsk(
  recipe: SiteLiveRecipe,
  bestSell: number | null | undefined,
): number | null {
  return liveIskFor(recipe.units, bestSell ?? null) ?? recipe.seedIsk;
}

export function scannerLiveEstIsk(
  recipes: readonly SiteLiveRecipe[],
  priceOf: (typeId: number) => { bestSell: number | null } | undefined,
  isPending: (typeId: number) => boolean,
): { readonly total: number | null; readonly pending: boolean } {
  if (recipes.length === 0) {
    return { total: null, pending: false };
  }
  let total: number | null = null;
  let pending = false;
  for (const recipe of recipes) {
    const value = recipeLiveIsk(recipe, priceOf(recipe.typeId)?.bestSell);
    if (value !== null) total = (total ?? 0) + value;
    if (isPending(recipe.typeId)) pending = true;
  }
  return { total, pending };
}

export function scannerLiveTypeIdKey(typeIds: readonly number[]): string {
  return [...new Set(typeIds)].sort((a, b) => a - b).join(',');
}

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

export function scannerEstIskSum(
  names: readonly (string | null)[],
  catalogue: {
    readonly estIskForName: (name: string) => number | null;
    readonly liveRecipesForName: (name: string) => readonly SiteLiveRecipe[];
  },
  priceOf: (typeId: number) => { bestSell: number | null } | undefined,
): number | null {
  if (names.length === 0) return null;
  let total = 0;
  for (const name of names) {
    if (name === null) return null;
    const recipes = catalogue.liveRecipesForName(name);
    if (recipes.length === 0) {
      const seed = catalogue.estIskForName(name);
      if (seed === null) return null;
      total += seed;
      continue;
    }
    for (const recipe of recipes) {
      const value = recipeLiveIsk(recipe, priceOf(recipe.typeId)?.bestSell);
      if (value === null) return null;
      total += value;
    }
  }
  return total;
}

import { ON_DEMAND_REFRESH_MAX_TYPE_IDS } from '@/data/market-prices/constants';
import { readBlueprintList, type RecentBlueprint, writeBlueprintList } from './recent-blueprints';

const WATCHLIST_KEY = 'lgi:industry:watchlist';

/** One price refresh covers the whole list. */
export const WATCHLIST_MAX = ON_DEMAND_REFRESH_MAX_TYPE_IDS;

export function isWatched(list: readonly RecentBlueprint[], typeId: number): boolean {
  return list.some((entry) => entry.typeId === typeId);
}

/** Adds a blueprint to the front of the list, or drops it when it is already there. */
export function toggleWatched(
  list: readonly RecentBlueprint[],
  entry: RecentBlueprint,
  max: number = WATCHLIST_MAX,
): RecentBlueprint[] {
  if (isWatched(list, entry.typeId)) return list.filter((item) => item.typeId !== entry.typeId);
  return [entry, ...list].slice(0, max);
}

export function readWatchlist(): RecentBlueprint[] {
  return readBlueprintList(WATCHLIST_KEY, WATCHLIST_MAX);
}

export function writeWatchlist(list: RecentBlueprint[]): void {
  writeBlueprintList(WATCHLIST_KEY, list);
}

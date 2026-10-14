import type { EsiStoreKey } from '@/data/esi-store';
import { eveTag } from '@/lib/esi-datasets/routes';
import { THE_FORGE_REGION_ID } from '@/data/eve-data/constants';

/** The one route every stored price answers under, spelled once. */
const ORDERS_ROUTE = '/markets/{region_id}/orders/';

export const MARKET_PRICES_TAG = eveTag('market_prices');

/** One type's Forge order book: the key its stored price expires under. */
export function priceKey(typeId: number): EsiStoreKey {
  return { route: ORDERS_ROUTE, holder: { kind: 'global' }, params: { region_id: THE_FORGE_REGION_ID, order_type: 'all', type_id: typeId } };
}

/**
 * One page of a type's Forge order book. Page 1 is the type's own key; a
 * later page has a key of its own, read with page 1 and never committed.
 */
export function pricePageKey(typeId: number, page: number): EsiStoreKey {
  const key = priceKey(typeId);
  return page === 1 ? key : { ...key, params: { ...key.params, page } };
}

/** One page of the whole Forge order book, the nightly dump's unit of work. */
export function regionDumpKey(page: number): EsiStoreKey {
  return { route: ORDERS_ROUTE, holder: { kind: 'global' }, params: { region_id: THE_FORGE_REGION_ID, order_type: 'all', page } };
}

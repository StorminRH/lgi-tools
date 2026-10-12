import type { EsiStoreKey } from '@/data/esi-store';
import { eveTag } from '@/lib/esi-datasets/routes';
import { ESI_REGION_ID_FORGE } from './constants';

const ORDERS_ROUTE = '/markets/{region_id}/orders/';

export const MARKET_PRICES_TAG = eveTag('market_prices');

/** One type's Forge order book: the key its stored price expires under. */
export function priceKey(typeId: number): EsiStoreKey {
  return { route: ORDERS_ROUTE, holder: { kind: 'global' }, params: { region_id: ESI_REGION_ID_FORGE, order_type: 'all', type_id: typeId } };
}

/** One page of the whole Forge order book, the nightly dump's unit of work. */
export function regionDumpKey(page: number): EsiStoreKey {
  return { route: ORDERS_ROUTE, holder: { kind: 'global' }, params: { region_id: ESI_REGION_ID_FORGE, order_type: 'all', page } };
}

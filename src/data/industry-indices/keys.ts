import type { EsiStoreKey } from '@/data/esi-store';
import { eveTag } from '@/lib/esi-datasets/routes';

/** The one tag both industry index readers and their writers share: cost indices and adjusted prices are one dataset. */
export const INDUSTRY_INDICES_TAG = eveTag('industry_indices');

/** The stored answer behind every system's cost indices: one document for all of New Eden. */
export const COST_INDICES_KEY: EsiStoreKey = { route: '/industry/systems/', holder: { kind: 'global' } };

export const ADJUSTED_PRICES_KEY: EsiStoreKey = { route: '/markets/prices/', holder: { kind: 'global' } };

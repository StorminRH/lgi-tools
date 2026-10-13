import type { SiteDetail } from './api-contract';
import type { SiteType, WormholeClass } from './site-taxonomy';

export type { SiteType, WormholeClass };
export type { Npc, SiteDetail, SiteResource, Wave } from './api-contract';

/** One site row: the detail contract without its waves and resources. */
export type SiteListItem = Omit<SiteDetail, 'waves' | 'resources'>;

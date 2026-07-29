import { cache } from 'react';
import { getEsiRefreshQueueStats } from '@/data/esi-refresh-jobs/queries';

/**
 * Reads the refresh-queue status rollup shared across one dashboard render. Both the service-
 * indicator panel and the queue panel need it, so without sharing the page would issue the same
 * query twice per request.
 */
export const getEsiRefreshQueueStatsShared = cache(getEsiRefreshQueueStats);

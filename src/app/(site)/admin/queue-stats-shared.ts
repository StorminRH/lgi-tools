import { cache } from 'react';
import { getEsiRefreshQueueStats } from '@/data/esi-refresh-jobs/queries';

export const getEsiRefreshQueueStatsShared = cache(getEsiRefreshQueueStats);

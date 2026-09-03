import { cache } from 'react';
import { getLastSyncedAt } from '@/data/gsc/queries';

export const getLastSyncedAtShared = cache(getLastSyncedAt);

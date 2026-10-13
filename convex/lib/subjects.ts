import { isColdFromPresence, LOCATION_COLD_AFTER_MS } from '@/lib/sync-engine';
import type { Doc } from '../_generated/dataModel';
import type { DatabaseReader } from '../_generated/server';
import { uniqueByUserDataset } from './indexedQuery';

/** The user's location-watcher presence row, if any tab has ever beaten. */
export function getLocationPresence(
  db: DatabaseReader,
  userId: string,
): Promise<Doc<'syncPresence'> | null> {
  return uniqueByUserDataset(db, 'characterLocation', userId);
}

/** No tab has watched recently enough to keep location sync running. */
export async function isLocationWatcherCold(
  db: DatabaseReader,
  userId: string,
  now: number,
): Promise<boolean> {
  return isColdFromPresence(await getLocationPresence(db, userId), LOCATION_COLD_AFTER_MS, now);
}

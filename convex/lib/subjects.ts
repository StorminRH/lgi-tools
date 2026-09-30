import type { Doc } from '../_generated/dataModel';
import type { DatabaseReader } from '../_generated/server';
import { type StoredDataset, uniqueByUserDataset } from './indexedQuery';

export function getPresence(
  db: DatabaseReader,
  dataset: StoredDataset,
  userId: string,
): Promise<Doc<'syncPresence'> | null> {
  return uniqueByUserDataset(db, dataset, userId);
}

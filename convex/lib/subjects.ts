// The engine's subject lookup, shared with the trackers' applySyncResults
// (generation guard) and forViewer (run-state wire). Pure helper only: no
// Convex function exports, so nothing here lands on the deployed API surface.
import type { SyncDataset } from '@/lib/sync-engine';
import type { Doc } from '../_generated/dataModel';
import type { DatabaseReader } from '../_generated/server';

export function getSyncSubject(
  db: DatabaseReader,
  dataset: SyncDataset,
  userId: string,
): Promise<Doc<'syncSubjects'> | null> {
  return db
    .query('syncSubjects')
    .withIndex('by_user_dataset', (q) => q.eq('userId', userId).eq('dataset', dataset))
    .unique();
}

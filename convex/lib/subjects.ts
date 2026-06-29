// The engine's subject and presence lookups, shared with the canary's
// applySyncResults (generation guard) and forViewer (run-state wire). Pure
// read helpers only: no Convex function exports, so nothing here lands on the
// deployed API surface. The presence write (an upsert) stays inline in the
// heartbeat handler — this module is read-only by design.
//
// The `dataset` param is the STORED schema literal (StoredDataset). Today that is a
// single value (onlineStatus); the schema union is designed to hold a SUPERSET of the
// active registry while a dataset is being retired (the drain-window pattern in
// docs/CONVEX.md), and these lookups stay typed off the stored union so they can still
// find/clean a retiring dataset's leftover rows during that window.
import type { Doc } from '../_generated/dataModel';
import type { DatabaseReader } from '../_generated/server';

// The dataset values that can be STORED — the schema's dataset literal (a single value
// today; a superset of the active SyncDataset during a future drain window).
type StoredDataset = Doc<'syncSubjects'>['dataset'];

export function getSyncSubject(
  db: DatabaseReader,
  dataset: StoredDataset,
  userId: string,
): Promise<Doc<'syncSubjects'> | null> {
  return db
    .query('syncSubjects')
    .withIndex('by_user_dataset', (q) => q.eq('userId', userId).eq('dataset', dataset))
    .unique();
}

export function getPresence(
  db: DatabaseReader,
  dataset: StoredDataset,
  userId: string,
): Promise<Doc<'syncPresence'> | null> {
  return db
    .query('syncPresence')
    .withIndex('by_user_dataset', (q) => q.eq('userId', userId).eq('dataset', dataset))
    .unique();
}

// The engine's subject and presence lookups, shared with the trackers'
// applySyncResults (generation guard) and forViewer (run-state wire). Pure
// read helpers only: no Convex function exports, so nothing here lands on the
// deployed API surface. The presence write (an upsert) stays inline in the
// heartbeat handler — this module is read-only by design.
//
// The `dataset` param is the STORED schema union (StoredDataset), NOT the narrower
// active SyncDataset: a dataset retired from the active registry (e.g. skills after
// MIGRATE.B.1) keeps its schema literal + leftover rows until the session-D wipe, and
// these lookups must still find/clean those rows. The active registry (SYNC_DATASETS)
// is what decides whether a found subject DISPATCHES; the engine retires an orphaned
// one instead (see isRegisteredDataset).
import type { Doc } from '../_generated/dataModel';
import type { DatabaseReader } from '../_generated/server';

// The dataset values that can be STORED — the schema's dataset union, a superset of
// the active SyncDataset (it retains dormant literals through their session-D wipe).
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

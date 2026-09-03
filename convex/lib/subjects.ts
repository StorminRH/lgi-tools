import type { WithoutSystemFields } from 'convex/server';
import type { Doc } from '../_generated/dataModel';
import type { DatabaseReader } from '../_generated/server';
import { uniqueByUserDataset } from './indexedQuery';

export type StoredDataset = Doc<'syncSubjects'>['dataset'];

export function newIdleSubject(
  dataset: StoredDataset,
  userId: string,
): WithoutSystemFields<Doc<'syncSubjects'>> {
  return {
    dataset,
    userId,
    status: 'idle' as const,
    lastRequestedAt: 0,
    workId: null,
    nextDueAt: null,
    minExpiresAt: null,
    syncedCharacterIds: [] as number[],
    lastFinishedAt: null as number | null,
    lastError: null,
    rlGroup: null,
    rlLimit: null,
    rlRemaining: null,
    rlUsed: null,
  };
}

export function getSyncSubject(
  db: DatabaseReader,
  dataset: StoredDataset,
  userId: string,
): Promise<Doc<'syncSubjects'> | null> {
  return uniqueByUserDataset(db, 'syncSubjects', dataset, userId);
}

export function getPresence(
  db: DatabaseReader,
  dataset: StoredDataset,
  userId: string,
): Promise<Doc<'syncPresence'> | null> {
  return uniqueByUserDataset(db, 'syncPresence', dataset, userId);
}

import { foldLegacyConnection, type LegacyConnectionBag } from '@/data/maps/__tests__/connection-fold';
import type { Doc, Id } from '../_generated/dataModel';

/** Folds a pre-hallway bag into an in-memory connection document. */
export function connectionTestDoc(
  bag: LegacyConnectionBag & {
    readonly _id?: Id<'mapConnections'>;
    readonly _creationTime?: number;
  },
): Doc<'mapConnections'> {
  return {
    _id: bag._id ?? ('c1' as Id<'mapConnections'>),
    _creationTime: bag._creationTime ?? 1,
    ...foldLegacyConnection(bag),
  };
}

/** Insertable hallway document from a pre-fold bag. */
export function connectionInsert(bag: LegacyConnectionBag) {
  return foldLegacyConnection(bag);
}

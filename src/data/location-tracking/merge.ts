import type { ConvexDoorRequest } from '@/lib/convex-door-contract';
import { ConvexDoorError, postConvexHttpDoor, type ConvexDoorOptions } from '@/lib/convex-http-door';
import {
  deleteExpiredTrackingReceiptsDoor,
  listExpiredTrackingReceiptsDoor,
  restoreMergeTrackingDoor,
  snapshotMergeTrackingDoor,
} from './convex-doors';
import type { TrackingSelection } from './merge-contract';

export class LocationTrackingMergeError extends ConvexDoorError {
  override readonly name = 'LocationTrackingMergeError';
}

function mergeDoorOptions(label: string): ConvexDoorOptions {
  return { error: LocationTrackingMergeError, label, timeoutMs: 4000 };
}

export async function snapshotMergeTracking(sourceUserId: string): Promise<TrackingSelection[]> {
  const result = await postConvexHttpDoor(
    snapshotMergeTrackingDoor,
    { sourceUserId },
    mergeDoorOptions('Location tracking snapshot unavailable'),
  );
  return result.selections;
}

export function restoreMergeTracking(
  operationId: string,
  survivorUserId: string,
  selections: TrackingSelection[],
) {
  return postConvexHttpDoor(
    restoreMergeTrackingDoor,
    { operationId, survivorUserId, selections },
    mergeDoorOptions('Location tracking restore unavailable'),
  );
}

export function listExpiredTrackingReceipts(cutoff: number, cursor: string | null) {
  return postConvexHttpDoor(
    listExpiredTrackingReceiptsDoor,
    { cutoff, cursor },
    mergeDoorOptions('Tracking receipt candidates unavailable'),
  );
}

export function deleteExpiredTrackingReceipts(
  cutoff: number,
  receipts: ConvexDoorRequest<typeof deleteExpiredTrackingReceiptsDoor>['receipts'],
) {
  return postConvexHttpDoor(
    deleteExpiredTrackingReceiptsDoor,
    { cutoff, receipts },
    mergeDoorOptions('Tracking receipt deletion unavailable'),
  );
}

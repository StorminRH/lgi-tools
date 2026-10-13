import { httpRouter, type PublicHttpAction } from 'convex/server';
import { leaveSyncDoor } from '@/data/convex/leave-contract';
import {
  deleteExpiredTrackingReceiptsDoor,
  listExpiredTrackingReceiptsDoor,
  purgeLocationTrackingDoor,
  restoreMergeTrackingDoor,
  snapshotMergeTrackingDoor,
} from '@/data/location-tracking/convex-doors';
import {
  authorJumpDoor,
  eliminationEvidenceDoor,
  jumpTransitionEvidenceDoor,
  mapTrackingSnapshotDoor,
  projectMapAccessDoor,
  purgeMapAccessDoor,
  purgeMapChainDoor,
  purgeUserMapClaimsDoor,
} from '@/data/maps/convex-doors';
import { purgeOnlineDoor } from '@/data/online-status/convex-doors';
import {
  mergeUserState,
  snapshotMergeTracking,
  restoreMergeTracking,
  listExpiredTrackingReceipts,
  deleteExpiredTrackingReceipts,
} from './httpAccountMerge';
import { purgeOnline } from './httpEngine';
import { jumpEvidence, resolveJump, signatureElimination } from './httpJump';
import { leaveSync, purgeLocationTracking } from './httpLocation';
import {
  mapTrackingSnapshot,
  projectMapAccess,
  purgeMapAccess,
  purgeMapChain,
  purgeUserMapClaims,
} from './httpMapAccess';

const http = httpRouter();

/**
 * Routes a door's path once. Operations that share a path share one handler,
 * which dispatches on the request's discriminant.
 */
function routeDoor(door: { readonly path: string }, handler: PublicHttpAction): void {
  http.route({ path: door.path, method: 'POST', handler });
}

routeDoor(jumpTransitionEvidenceDoor, jumpEvidence);
routeDoor(authorJumpDoor, resolveJump);
routeDoor(eliminationEvidenceDoor, signatureElimination);
routeDoor(purgeOnlineDoor, purgeOnline);
routeDoor(leaveSyncDoor, leaveSync);
routeDoor(purgeLocationTrackingDoor, purgeLocationTracking);
routeDoor(projectMapAccessDoor, projectMapAccess);
routeDoor(purgeMapAccessDoor, purgeMapAccess);
routeDoor(purgeUserMapClaimsDoor, purgeUserMapClaims);
routeDoor(mapTrackingSnapshotDoor, mapTrackingSnapshot);
routeDoor(purgeMapChainDoor, purgeMapChain);
routeDoor(snapshotMergeTrackingDoor, snapshotMergeTracking);
routeDoor(restoreMergeTrackingDoor, restoreMergeTracking);
routeDoor(listExpiredTrackingReceiptsDoor, listExpiredTrackingReceipts);
routeDoor(deleteExpiredTrackingReceiptsDoor, deleteExpiredTrackingReceipts);

// Convex-only: no Next caller, so no shared door contract.
http.route({
  path: '/merge-user-state',
  method: 'POST',
  handler: mergeUserState,
});

export default http;

import { httpRouter } from 'convex/server';
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

http.route({
  path: '/jump-evidence',
  method: 'POST',
  handler: jumpEvidence,
});

http.route({
  path: '/resolve-jump',
  method: 'POST',
  handler: resolveJump,
});

http.route({
  path: '/signature-elimination',
  method: 'POST',
  handler: signatureElimination,
});

http.route({
  path: '/purge-online',
  method: 'POST',
  handler: purgeOnline,
});

http.route({
  path: '/leave-sync',
  method: 'POST',
  handler: leaveSync,
});

http.route({
  path: '/purge-location-tracking',
  method: 'POST',
  handler: purgeLocationTracking,
});

http.route({
  path: '/project-map-access',
  method: 'POST',
  handler: projectMapAccess,
});

http.route({
  path: '/purge-map-access',
  method: 'POST',
  handler: purgeMapAccess,
});

http.route({
  path: '/purge-user-map-claims',
  method: 'POST',
  handler: purgeUserMapClaims,
});

http.route({
  path: '/map-tracking-snapshot',
  method: 'POST',
  handler: mapTrackingSnapshot,
});

http.route({
  path: '/purge-map-chain',
  method: 'POST',
  handler: purgeMapChain,
});

http.route({
  path: '/merge-user-state',
  method: 'POST',
  handler: mergeUserState,
});

http.route({ path: '/snapshot-merge-tracking', method: 'POST', handler: snapshotMergeTracking });
http.route({ path: '/restore-merge-tracking', method: 'POST', handler: restoreMergeTracking });
http.route({ path: '/list-expired-tracking-receipts', method: 'POST', handler: listExpiredTrackingReceipts });
http.route({ path: '/delete-expired-tracking-receipts', method: 'POST', handler: deleteExpiredTrackingReceipts });

export default http;

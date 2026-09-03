import { httpRouter } from 'convex/server';
import { sweep, purgeOnline } from './httpEngine';
import { jumpEvidence, resolveJump, signatureElimination } from './httpJump';
import { leaveSync, purgeLocationTracking } from './httpLocation';
import { projectMapAccess, purgeMapAccess, purgeMapChain } from './httpMapAccess';

const http = httpRouter();

http.route({
  path: '/sweep',
  method: 'POST',
  handler: sweep,
});

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
  path: '/purge-map-chain',
  method: 'POST',
  handler: purgeMapChain,
});

export default http;

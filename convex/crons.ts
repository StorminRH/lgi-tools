import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.interval('sync engine retention', { hours: 24 }, internal.engineSweep.sweep, {});
crons.interval(
  'map chain purge',
  { minutes: 15 },
  internal.mapChainCleanup.purgeExpiredChainTombstones,
  {},
);
crons.interval(
  'map signature purge',
  { minutes: 15 },
  internal.mapScan.purgeExpiredSignatureTombstones,
  {},
);
crons.interval(
  'map ceiling collapse',
  { minutes: 15 },
  internal.mapAuthoringSweep.collapseExpiredConnections,
  {},
);

crons.interval('character authorization', { minutes: 5 }, internal.characterAuthorization.verify, {});

export default crons;

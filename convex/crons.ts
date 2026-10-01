import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.interval('sync engine retention', { hours: 24 }, internal.engineSweep.sweep, {});
crons.interval(
  'map chain purge',
  { hours: 24 },
  internal.mapChainCleanup.purgeExpiredChainTombstones,
  {},
);
crons.interval(
  'map signature purge',
  { hours: 24 },
  internal.mapScan.purgeExpiredSignatureTombstones,
  {},
);
crons.interval(
  'map ceiling collapse',
  { hours: 1 },
  internal.mapAuthoringSweep.collapseExpiredConnections,
  {},
);

export default crons;

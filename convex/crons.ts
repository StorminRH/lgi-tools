import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.interval('sync engine scan', { seconds: 30 }, internal.engineScan.scan, {});
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

export default crons;

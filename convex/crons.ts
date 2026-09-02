// Static cron registry. ONE global dispatcher tick for the presence-gated
// sync engine — deliberately not per-subject (Convex crons are static); the
// per-subject schedule lives in syncSubjects.nextDueAt and this scan just
// dispatches whatever has come due. GET /api/cron/sync-sweeper is an
// unscheduled CRON_SECRET watchdog for THIS cron (Hobby forbids sub-daily
// Vercel schedules).
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

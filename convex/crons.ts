// Static cron registry. ONE global dispatcher tick for the presence-gated
// sync engine — deliberately not per-subject (Convex crons are static); the
// per-subject schedule lives in syncSubjects.nextDueAt and this scan just
// dispatches whatever has come due. The 15-minute Vercel sweeper
// (/api/cron/sync-sweeper) is the external watchdog for THIS cron.
import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.interval('sync engine scan', { seconds: 30 }, internal.engine.scan, {});

export default crons;

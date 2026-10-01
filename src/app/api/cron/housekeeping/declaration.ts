import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';
import { runHousekeeping, type HousekeepingSummary } from '@/composition/pipelines/housekeeping';

export const housekeepingDeclaration: CronRouteDeclaration<HousekeepingSummary> = {
  name: 'cron:housekeeping',
  action: 'cron_housekeeping',
  capability: 'cron.housekeeping',
  wakeClass: 'batch',
  record: {
    policy: 'always',
    justification: 'runs inside the daily batch wake and records every run so a failing cleanup stays visible',
  },
  lock: {
    mode: 'none',
    justification:
      'every delete is idempotent, a retried deletion resumes from its kept link or user, and a tracking-merge delivery locks its own rows; a session lock must not be held across their Convex calls',
  },
  work: async () => {
    const summary = await runHousekeeping();
    return {
      outcome: summary.status,
      workDone:
        summary.deletes.some((result) => result.deleted > 0)
        || summary.retries.some((result) => result.succeeded > 0),
      failed: summary.status === 'partial',
      telemetry: { deletes: summary.deletes, retries: summary.retries },
      body: summary,
    };
  },
};

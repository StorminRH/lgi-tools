import type { CronRouteDeclaration } from '@/composition/pipelines/cron-gate';
import { type NetWorthRevalueSummary, revalueAllNetWorth } from '@/composition/board/net-worth-nightly';

/** Leaves the rest of the 300 s daily batch to the steps after it. */
const REVALUE_BUDGET_MS = 60_000;

export const revalueNetWorthDeclaration: CronRouteDeclaration<NetWorthRevalueSummary> = {
  name: 'cron:net-worth',
  action: 'cron_net_worth',
  capability: 'cron.revalue-net-worth',
  wakeClass: 'batch',
  record: {
    policy: 'always',
    justification: 'runs inside the daily batch wake and records every run so a stalled revalue stays visible',
  },
  lock: {
    mode: 'none',
    justification: "each account's day is one upsert keyed by (user, day); a repeat run rewrites the same rows",
  },
  work: async () => {
    const summary = await revalueAllNetWorth(Date.now() + REVALUE_BUDGET_MS);
    return {
      outcome: summary.failed > 0 ? 'partial' : 'revalued',
      workDone: summary.revalued > 0,
      failed: summary.failed > 0,
      telemetry: { ...summary },
      body: summary,
    };
  },
};

import type { CronRefreshGscResponse } from '@/data/gsc/api-contract';
import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import { refreshGscDeclaration } from './declaration';

// Vercel-cron endpoint, scheduled in vercel.json ("0 9 * * *" — daily, clear of
// the 11:30 prices sweep and the daily SDE run). Vercel's cron invoker sends
// GET with `Authorization: Bearer ${CRON_SECRET}`; reject anything else with 401
// so the URL stays inert if scraped.
//
// Pulls Google Search Console snapshots into our own tables; the admin
// dashboard reads only the stored copy. A failed/throttled sync degrades to the
// last snapshot (the page shows last-known, not broken) and is logged here.
// Runs under the shared cron gate's advisory lock, which skips an overlapping
// run of itself — under Vercel's at-least-once cron delivery a duplicate
// dispatch would otherwise double-pull the quota'd GSC API. The daily
// retention prunes piggyback on the same lock, so the tables stay bounded with
// no extra cron slot.
//
/**
 * Runs the declared GSC sync and retention batch; accepts only cron bearer
 * auth and consumes no body or query parameters.
 */
// authz: cron
// input: none
export const GET = defineCronRoute<CronRefreshGscResponse>(
  refreshGscDeclaration,
);

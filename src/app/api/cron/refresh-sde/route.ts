import type { CronRefreshSdeResponse } from '@/data/eve-data/api-contract';
import { defineCronRoute } from '@/db/cron-gate';
import { refreshSdeDeclaration } from './declaration';

type SdePreLockState = Parameters<typeof refreshSdeDeclaration.work>[1];

/**
 * Vercel cron endpoint. Wired to "50 11 * * *" in vercel.json (daily
 * 11:50 UTC — right after EVE's 11:00 downtime and the prices/indices
 * crons, so a same-day SDE patch is detected within the hour). Vercel
 * dispatches GET with `Authorization: Bearer ${CRON_SECRET}`.
 *
 * On drift (stored sde_version != CCP's current build number),
 * acquires the SDE advisory lock and runs the full pipeline inline:
 * JSONL ingest → tree resolver → tracked-types seeding. Vercel Pro
 * allows up to 300s per invocation; the full run typically completes
 * in ~120s (30s download + 30s ingest + 60s resolver + \<5s seeding).
 *
 * No-drift path returns in \<2s — just a GET of CCP's SDE manifest and
 * a meta lookup.
 */
export const maxDuration = 300;

/**
 * Runs the declared SDE version check and refresh; accepts only cron bearer
 * auth and consumes no body or query parameters.
 */
// authz: cron
// input: none
export const GET = defineCronRoute<CronRefreshSdeResponse, SdePreLockState>(
  refreshSdeDeclaration,
);

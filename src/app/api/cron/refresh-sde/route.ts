import type { CronRefreshSdeResponse } from '@/data/eve-data/api-contract';
import { defineCronRoute } from '@/composition/pipelines/cron-gate';
import { refreshSdeDeclaration } from './declaration';

type SdePreLockState = Parameters<typeof refreshSdeDeclaration.work>[1];

/**
 * Vercel cron endpoint. Wired to "0 14 * * *" in vercel.json. Hobby fires
 * it anywhere in the 14:00 UTC hour, which keeps it in its own invocation and
 * after the whole 12:00 daily batch, however late either fires. Vercel
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

// authz: cron
// input: none
export const GET = defineCronRoute<CronRefreshSdeResponse, SdePreLockState>(
  refreshSdeDeclaration,
);

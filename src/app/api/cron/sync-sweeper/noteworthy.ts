import type { CronSyncSweeperResponse } from '@/data/convex/api-contract';

/**
 * The sweeper is the sync engine's external watchdog. It is unscheduled on
 * Hobby and only runs when an operator GETs it with CRON_SECRET. A healthy
 * run is a no-op (status 'swept' or 'skipped', nothing dispatched), and its
 * only durable side effect used to be a telemetry INSERT — which, on an idle
 * system, was the SOLE thing waking Neon's compute and kept it from suspending
 * (~$6/mo of kept-warm at zero users; the scaling audit's idle-poke finding).
 *
 * Record a durable row only when the run is noteworthy: it had to re-arm an
 * overdue subject (dispatched \> 0 — the watchdog earned its keep, meaning the
 * deployment's own 30s scan lagged) or it failed outright. The healthy case
 * still emits a runtime-log line in the route, so a manual invoke stays
 * answerable from `vercel logs` without poking Neon.
 */
export function isNoteworthySweep(summary: CronSyncSweeperResponse): boolean {
  return summary.status === 'failed' || (summary.dispatched ?? 0) > 0;
}

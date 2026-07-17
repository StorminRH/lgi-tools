// API wire contract owned by the convex slice (3.4.9).

/**
 * ── GET /api/cron/sync-sweeper (authz: cron) ────────────────────────────
 * The sync engine's external watchdog: relays the deployment's sweep counts.
 * All JSON-primitive fields, so the TS type is the wire truth; no
 * programmatic consumer — pinned with `satisfies` in the route. Counts are
 * null when the sweep never reached the deployment (skipped/failed).
 */
export interface CronSyncSweeperResponse {
  status: 'swept' | 'skipped' | 'failed';
  reason?: string;
  // Healthy system: all zeros. dispatched > 0 means the deployment's own
  // 30s scan is dead or lagging — the watchdog signal.
  dispatched: number | null;
  retired: number | null;
  deleted: number | null;
  durationMs: number;
}

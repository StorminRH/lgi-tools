// API wire contract owned by the gsc slice (3.4.T).
import type { GscSyncSummary } from './types';

/**
 * ── GET /api/cron/refresh-gsc (authz: cron) ─────────────────────────────
 * The route returns the sync summary verbatim (all JSON-primitive fields, so
 * the TS type is the wire truth). No programmatic consumer — pinned with
 * `satisfies` in the route.
 */
export type CronRefreshGscResponse = GscSyncSummary;

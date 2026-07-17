// API wire contracts owned by the industry-indices slice (3.5.1b).

/**
 * ── GET /api/cron/refresh-industry-indices (authz: cron) ────────────────
 * No programmatic consumer (Vercel cron reads logs only) — types pinned with
 * `satisfies` in the route. `busy` means another run held the advisory lock;
 * `refreshed` carries each dataset's ok flag + rows written this run.
 */
export type CronRefreshIndustryIndicesResponse =
  | { status: 'busy' }
  | {
      status: 'refreshed';
      costIndices: { ok: boolean; written: number };
      adjustedPrices: { ok: boolean; written: number };
    };

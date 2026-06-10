// API wire contract owned by the eve-data slice (3.4.T).
//
// Type-only import from the composition layer: the SDE cron's reingested arm
// embeds the pipeline summary that src/db/sde-pipeline.ts (the layer above
// this slice) assembles. `import type` is erased at compile time, so this
// creates no runtime edge or cycle.
import type { SdePipelineSummary } from '@/db/sde-pipeline';

// ── GET /api/cron/refresh-sde (authz: cron) ─────────────────────────────
// No programmatic consumer (Vercel cron reads logs only) — arms pinned with
// `satisfies` in the route. Version markers are CCP build-number strings.
export type CronRefreshSdeResponse =
  | { status: 'up-to-date'; sdeVersion: string }
  | { status: 'remote-unreachable'; sdeVersion: string }
  | { status: 'busy'; message: string }
  | {
      status: 'reingested';
      sdeVersionBefore: string | null;
      sdeVersionAfter: string | null;
      summary: SdePipelineSummary;
      marketPrices: { total: number; priced: number };
    };

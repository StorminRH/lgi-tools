// The five user-centered service indicators fixed by roadmap section 3.10.3.1,
// with the two things that make an indicator actionable rather than decorative:
// who acts when it degrades, and what they do.
//
// These live beside the telemetry rows they read rather than in a prose document
// under `docs/`: a typed const makes the owner and the response action
// non-optional at compile time and lets `sli-queries.ts` and the admin panel
// derive from one list instead of restating it — the exact drift
// `vendor-resilience-registry.ts` exists to prevent.
//
// Nothing here is alerted on. Alerting infrastructure beyond what already exists
// is out of scope for this session.

/**
 * Who acts when an indicator degrades. Closed because an unowned indicator is not an SLI.
 * For a single-operator project the honest values are the operator and CCP's upstream service.
 */
export type SliOwner = 'operator' | 'ccp-upstream';

/** Stable identifiers for the five indicators. */
export const SLI_IDS = [
  'read_success_rate',
  'mutation_success_rate',
  'critical_latency_p95',
  'esi_success_rate',
  'job_backlog',
] as const;

/** One indicator's stable identifier. */
export type SliId = (typeof SLI_IDS)[number];

/** How an indicator's live value should be read. */
export type SliUnit = 'percent' | 'milliseconds' | 'count';

/**
 * One user-centered service indicator: what it measures, who owns it, and the exact action taken
 * when it degrades. The admin panel keys each indicator's live value by `id`.
 */
export interface SliDefinition {
  id: SliId;
  title: string;
  measures: string;
  owner: SliOwner;
  responseAction: string;
  unit: SliUnit;
}

/** The five indicators fixed by roadmap section 3.10.3.1. */
export const SLI_DEFINITIONS: readonly SliDefinition[] = [
  {
    id: 'read_success_rate',
    title: 'Page and tool success rate',
    measures:
      'Share of recorded page and tool-read operations that completed without a failure category.',
    owner: 'operator',
    responseAction:
      'Read the failing capability’s recorded code and correlation id, then fix the failing read path before shipping anything else.',
    unit: 'percent',
  },
  {
    id: 'mutation_success_rate',
    title: 'Mutation success rate',
    measures:
      'Share of recorded mutations that succeeded, excluding validation failures — a rejected bad request is the system working, not failing.',
    owner: 'operator',
    responseAction:
      'Identify the failing mutation capability and roll back or fix it; a sustained drop here means users cannot save their work.',
    unit: 'percent',
  },
  {
    id: 'critical_latency_p95',
    title: 'p95 latency, critical reads and writes',
    measures:
      '95th-percentile total duration across the planner, structures, and account capabilities users wait on directly.',
    owner: 'operator',
    responseAction:
      'Compare the recorded per-dependency durations to find whether Neon, ESI, or our own work grew, and address that dependency.',
    unit: 'milliseconds',
  },
  {
    id: 'esi_success_rate',
    title: 'ESI success and throttle rate',
    measures:
      'Share of ESI-dependent operations that were neither rate limited nor failed by the upstream service.',
    owner: 'ccp-upstream',
    responseAction:
      'Wait out CCP’s budget window; do not raise call volume. Confirm the shared budget gate is degrading as designed rather than retrying harder.',
    unit: 'percent',
  },
  {
    id: 'job_backlog',
    title: 'Job backlog and terminal failures',
    measures:
      'Deferred ESI-refresh jobs currently due, plus jobs that exhausted their attempts and were dead-lettered.',
    owner: 'operator',
    responseAction:
      'Inspect the dead-letter reasons on the admin queue panel and requeue once the underlying cause is fixed; a rising backlog means owner data is going stale.',
    unit: 'count',
  },
];

// Recorded, deliberately unbuilt: OpenTelemetry or a third-party observability
// vendor is deferred. The capability record in capability.ts is vendor-neutral
// and writes through usage_logs, so adopting one later is an export concern
// rather than a re-instrumentation. Revisit when a second operator, a paging
// rotation, or cross-service tracing makes the dependency worth its cost.

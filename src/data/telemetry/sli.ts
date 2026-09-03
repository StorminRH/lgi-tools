export type SliOwner = 'operator' | 'ccp-upstream';

export const SLI_IDS = [
  'read_success_rate',
  'mutation_success_rate',
  'critical_latency_p95',
  'esi_success_rate',
  'job_backlog',
] as const;

export type SliId = (typeof SLI_IDS)[number];

export type SliUnit = 'percent' | 'milliseconds' | 'count';

export interface SliDefinition {
  id: SliId;
  title: string;
  measures: string;
  owner: SliOwner;
  responseAction: string;
  unit: SliUnit;
}

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


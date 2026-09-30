export type SliOwner = 'operator' | 'ccp-upstream';

export type SliId =
  | 'read_success_rate'
  | 'mutation_success_rate'
  | 'critical_latency_p95'
  | 'esi_success_rate'
  | 'job_backlog';

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
    title: 'Tracked read success',
    measures:
      'Share of recorded page and tool-read operations that completed without a failure category.',
    owner: 'operator',
    responseAction: 'Check failed reads.',
    unit: 'percent',
  },
  {
    id: 'mutation_success_rate',
    title: 'Save/action success',
    measures:
      'Share of recorded mutations that succeeded, excluding validation failures — a rejected bad request is the system working, not failing.',
    owner: 'operator',
    responseAction: 'Check failed saves and actions.',
    unit: 'percent',
  },
  {
    id: 'critical_latency_p95',
    title: 'Tracked operation p95',
    measures:
      '95th-percentile total duration across recorded read and mutation capabilities.',
    owner: 'operator',
    responseAction: 'Check slow operations.',
    unit: 'milliseconds',
  },
  {
    id: 'esi_success_rate',
    title: 'ESI availability',
    measures:
      'Share of ESI-dependent operations that were neither rate limited nor failed by the upstream service.',
    owner: 'ccp-upstream',
    responseAction: 'Check upstream errors and limits.',
    unit: 'percent',
  },
  {
    id: 'job_backlog',
    title: 'Active jobs and exhausted retries',
    measures:
      'Active ESI-refresh jobs, plus jobs that exhausted their attempts and were dead-lettered.',
    owner: 'operator',
    responseAction: 'Review the refresh queue.',
    unit: 'count',
  },
];


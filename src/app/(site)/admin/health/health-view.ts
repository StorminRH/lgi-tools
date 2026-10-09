import type { StatusLevel } from '@/data/telemetry/health-metrics';
import type { FailureGroup, SlowOperation } from '@/data/telemetry/capability-stats';
import { SLI_DEFINITIONS, type SliId, type SliOwner } from '@/data/telemetry/sli';
import {
  formatSliValue,
  queueLevel,
  sliLevel,
  sliTargetLabel,
  type QueueSummary,
  type SliSignals,
} from '../signals';

export interface ServiceLevelRow {
  id: SliId;
  title: string;
  value: string;
  target: string;
  level: StatusLevel;
  owner: string;
  responseAction: string;
}

const SIGNAL_FOR: Record<Exclude<SliId, 'job_backlog'>, keyof SliSignals> = {
  read_success_rate: 'readSuccess',
  mutation_success_rate: 'mutationSuccess',
  critical_latency_p95: 'latencyP95',
  esi_success_rate: 'esiSuccess',
};

const OWNER_LABEL: Record<SliOwner, string> = {
  operator: 'you',
  'ccp-upstream': 'upstream',
};

function measure(id: SliId, sli: SliSignals, queue: QueueSummary) {
  if (id === 'job_backlog') {
    return {
      value: `${queue.due.toLocaleString()} active · ${queue.deadLettered.toLocaleString()} dead`,
      target: '0 dead',
      level: queueLevel(queue),
    };
  }
  const key = SIGNAL_FOR[id];
  return {
    value: formatSliValue(key, sli[key]),
    target: sliTargetLabel(key),
    level: sliLevel(key, sli[key]),
  };
}

export function deriveServiceLevels(sli: SliSignals, queue: QueueSummary): ServiceLevelRow[] {
  return SLI_DEFINITIONS.map((definition) => ({
    id: definition.id,
    title: definition.title,
    owner: OWNER_LABEL[definition.owner],
    responseAction: definition.responseAction,
    ...measure(definition.id, sli, queue),
  }));
}

export function operationLabel(row: { feature: string | null; operation: string | null }): string {
  return `${row.feature} · ${row.operation}`;
}

/** The result, then its code and error class where they add something. */
export function failureResultLabel(row: FailureGroup): string {
  const parts: (string | null)[] = [row.outcome];
  if (row.code !== row.outcome) parts.push(row.code);
  if (row.errorClass !== null) parts.push(row.errorClass);
  return parts.join(' · ');
}

export function dayLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function slowOperationNote(row: SlowOperation): string {
  const runs = `${row.count.toLocaleString()} ${row.count === 1 ? 'run' : 'runs'}`;
  return row.slowestDependency === null ? runs : `${runs} · mostly ${row.slowestDependency} on average`;
}

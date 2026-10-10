import type { FailureGroup, SlowOperation } from '@/data/telemetry/capability-stats';
import { SLI_DEFINITIONS, type SliId, type SliOwner } from '@/data/telemetry/sli';
import { formatCount } from '@/lib/format/number';
import {
  formatSliValue,
  queueCounts,
  queueLevel,
  sliLevel,
  sliTargetLabel,
  type QueueSummary,
  type SliSignals,
  type StatusLine,
} from '../signals';

/** A service level as a status line: its title, reading and target, plus what to do when it slips. */
export interface ServiceLevelRow extends StatusLine {
  id: SliId;
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
    return { value: queueCounts(queue), note: 'target 0 dead', level: queueLevel(queue) };
  }
  const key = SIGNAL_FOR[id];
  return {
    value: formatSliValue(key, sli[key]),
    note: `target ${sliTargetLabel(key)}`,
    level: sliLevel(key, sli[key]),
  };
}

export function deriveServiceLevels(sli: SliSignals, queue: QueueSummary): ServiceLevelRow[] {
  return SLI_DEFINITIONS.map((definition) => ({
    id: definition.id,
    label: definition.title,
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
  const parts: string[] = [row.outcome];
  if (row.code !== null && row.code !== row.outcome) parts.push(row.code);
  if (row.errorClass !== null) parts.push(row.errorClass);
  return parts.join(' · ');
}

export function dayLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** Run count, where most of a run's time went, and how much of it no timed dependency covers. */
export function slowOperationNote(row: SlowOperation): string {
  const parts = [formatCount(row.count, 'run')];
  if (row.slowestDependency !== null) {
    parts.push(row.slowestShare === null
      ? `mostly ${row.slowestDependency}`
      : `mostly ${row.slowestDependency} (${percent(row.slowestShare)})`);
  }
  if (row.untimedShare !== null) parts.push(`${percent(row.untimedShare)} untimed`);
  return parts.join(' · ');
}

import type { Tone } from '@/components/ui/tones';
import {
  classifyOutcome,
  type OutcomeKind,
  type OutcomeRules,
} from '@/data/telemetry/health-metrics';
import type { CronOutcomeCount } from '@/data/telemetry/types';
import { formatQuantity } from '@/lib/format/number';

export interface TonedOutcome extends CronOutcomeCount {
  tone: Extract<Tone, 'green' | 'blue' | 'neutral' | 'orange' | 'red'>;
}

const KIND_RANK: Record<OutcomeKind, number> = {
  healthy: 0,
  neutral: 1,
  degraded: 2,
  unhealthy: 3,
};

// The first healthy outcome is the cron's normal result. Other healthy
// outcomes are fine but different, so they get their own colour.
function outcomeTone(outcome: string, kind: OutcomeKind, rules: OutcomeRules): TonedOutcome['tone'] {
  switch (kind) {
    case 'healthy':
      return outcome === rules.healthy[0] ? 'green' : 'blue';
    case 'neutral':
      return 'neutral';
    case 'degraded':
      return 'orange';
    case 'unhealthy':
      return 'red';
  }
}

/** Colours each outcome by health and orders good results before bad ones. */
export function toneOutcomes(rows: CronOutcomeCount[], rules: OutcomeRules): TonedOutcome[] {
  return rows
    .map((row) => {
      const kind = classifyOutcome(row.outcome, rules);
      return { row: { ...row, tone: outcomeTone(row.outcome, kind, rules) }, rank: KIND_RANK[kind] };
    })
    .sort((a, b) => a.rank - b.rank || b.row.count - a.row.count)
    .map(({ row }) => row);
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${formatQuantity(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

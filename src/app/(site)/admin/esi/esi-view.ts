import type { EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import { deriveEsiSourceStatus } from '@/data/telemetry/health-metrics';
import type { DegradationCallerCount, FallbackRateData } from '@/data/telemetry/types';
import { ESI_ERROR_CEILING } from '@/platform/esi/scoreboard/types';
import type { EsiBudgetSnapshot } from '@/platform/esi/scoreboard';
import {
  deriveBudgetStatus,
  formatSliValue,
  sliLevel,
  sliTargetLabel,
  type StatusLine,
} from '../signals';

export function deriveBudgetGauge(budget: EsiBudgetSnapshot | null) {
  const status = deriveBudgetStatus(budget);
  return {
    level: status.level,
    remaining: budget === null ? '—' : budget.effectiveRemaining.toLocaleString(),
    ceiling: ESI_ERROR_CEILING,
    pct:
      budget === null
        ? 0
        : Math.max(0, Math.min(100, (budget.effectiveRemaining / ESI_ERROR_CEILING) * 100)),
    note: status.note,
  };
}

export function fallbackShare(fallback: FallbackRateData): string {
  const priced = fallback.esi + fallback.fallback;
  if (priced === 0) return 'no data';
  const pct = (fallback.fallback / priced) * 100;
  if (pct > 0 && pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}

function countLine(
  id: string,
  label: string,
  count: number,
  note: string,
): StatusLine {
  return {
    id,
    label,
    value: count.toLocaleString(),
    note,
    level: count > 0 ? 'amber' : 'green',
  };
}

export function derivePressureLines(input: {
  esiSuccess: number | null;
  esiSamples?: number;
  budgetExhaustions: number;
  fallback: FallbackRateData;
  degradation: DegradationCallerCount[];
  queue: EsiRefreshQueueStat[];
}): StatusLine[] {
  const source = deriveEsiSourceStatus({
    fallback: input.fallback,
    // This row rates fallback share; the separate exhaustions row reports budget pressure.
    budgetExhaustions: 0,
  });
  const priced = input.fallback.esi + input.fallback.fallback;
  const degradationTotal = input.degradation.reduce((total, row) => total + row.count, 0);
  const deferred = input.queue
    .filter((stat) => stat.status === 'deferred_for_budget')
    .reduce((total, stat) => total + stat.count, 0);
  return [
    {
      id: 'esi-success',
      label: 'ESI availability',
      value: formatSliValue('esiSuccess', input.esiSuccess),
      note: `${input.esiSamples?.toLocaleString() ?? '—'} operations · target ${sliTargetLabel('esiSuccess')}`,
      level: sliLevel('esiSuccess', input.esiSuccess),
    },
    countLine(
      'exhaustions',
      'Budget-blocked refreshes',
      input.budgetExhaustions,
      '',
    ),
    {
      id: 'fallback',
      label: 'Scheduled Fuzzwork share',
      value: fallbackShare(input.fallback),
      note: `${input.fallback.fallback.toLocaleString()} of ${priced.toLocaleString()} priced items`,
      level: source.level,
    },
    countLine(
      'degradation',
      'Degraded price refreshes',
      degradationTotal,
      input.degradation.length === 0
        ? ''
        : input.degradation.map((row) => `${row.caller} ${row.count}`).join(' · '),
    ),
    countLine('deferred', 'Jobs held for budget', deferred, ''),
  ];
}

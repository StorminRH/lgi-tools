import type { EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import { deriveEsiSourceStatus } from '@/data/telemetry/health-metrics';
import type { DegradationCallerCount, FallbackRateData } from '@/data/telemetry/types';
import { ESI_ERROR_CEILING } from '@/platform/esi/scoreboard/types';
import type { EsiBudgetSnapshot } from '@/platform/esi/scoreboard';
import { formatQuantity } from '@/lib/format/number';
import { clampPct } from '@/lib/math';
import type { OpsMetricRow } from '../ops-view';
import {
  deriveBudgetStatus,
  formatSliValue,
  heldForBudget,
  sliLevel,
  sliTargetLabel,
  type StatusLine,
} from '../signals';

// The gauge shows the effective remaining budget; these are the readings behind it.
function budgetFigures(budget: EsiBudgetSnapshot): OpsMetricRow[] {
  return [
    {
      label: 'Observed HTTP errors',
      value: formatQuantity(budget.selfCount),
      note: '4xx/5xx · last 2 min',
    },
    {
      label: 'Lowest recent CCP allowance',
      value: budget.echo === null ? '—' : formatQuantity(budget.echo),
      note: budget.echo === null ? 'not observed' : 'CCP response header',
    },
    {
      label: 'Scoreboard source',
      value: budget.source === 'shared' ? 'shared' : 'process-local',
      note: budget.source === 'shared' ? 'Upstash Redis' : 'development fallback',
    },
  ];
}

/** The budget card: level and note from the same reading as the overview's line. */
export function deriveBudgetCard(budget: EsiBudgetSnapshot | null) {
  const status = deriveBudgetStatus(budget);
  return {
    level: status.level,
    note: status.note,
    remaining: budget === null ? '—' : formatQuantity(budget.effectiveRemaining),
    ceiling: ESI_ERROR_CEILING,
    pct:
      budget === null
        ? 0
        : clampPct((budget.effectiveRemaining / ESI_ERROR_CEILING) * 100),
    figures: budget === null ? [] : budgetFigures(budget),
  };
}

export function fallbackShare(fallback: FallbackRateData): string {
  const priced = fallback.esi + fallback.fallback;
  if (priced === 0) return 'no data';
  const pct = (fallback.fallback / priced) * 100;
  if (pct > 0 && pct < 1) return '<1%';
  return `${Math.round(pct)}%`;
}

function countLine(id: string, label: string, count: number, note?: string): StatusLine {
  return {
    id,
    label,
    value: formatQuantity(count),
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
  const deferred = heldForBudget(input.queue);
  return [
    {
      id: 'esi-success',
      label: 'ESI availability',
      value: formatSliValue('esiSuccess', input.esiSuccess),
      note: `${input.esiSamples === undefined ? '—' : formatQuantity(input.esiSamples)} operations · target ${sliTargetLabel('esiSuccess')}`,
      level: sliLevel('esiSuccess', input.esiSuccess),
    },
    countLine('exhaustions', 'Budget-blocked refreshes', input.budgetExhaustions),
    {
      id: 'fallback',
      label: 'Scheduled Fuzzwork share',
      value: fallbackShare(input.fallback),
      note: `${formatQuantity(input.fallback.fallback)} of ${formatQuantity(priced)} priced items`,
      level: source.level,
    },
    countLine(
      'degradation',
      'Degraded price refreshes',
      degradationTotal,
      input.degradation.length === 0
        ? undefined
        : input.degradation.map((row) => `${row.caller} ${formatQuantity(row.count)}`).join(' · '),
    ),
    countLine('deferred', 'Jobs held for budget', deferred),
  ];
}

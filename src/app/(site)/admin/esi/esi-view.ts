import type { EsiRefreshQueueStat } from '@/data/esi-refresh-jobs/types';
import type { EsiClientErrorSummary } from '@/data/telemetry/capability-stats';
import {
  deriveEsiSourceStatus,
  ESI_CLIENT_ERROR_TARGET,
  formatFallbackShare,
  targetLevel,
} from '@/data/telemetry/health-metrics';
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
      value: formatQuantity(budget.echo),
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

function countLine(id: string, label: string, count: number, note?: string): StatusLine {
  return {
    id,
    label,
    value: formatQuantity(count),
    note,
    level: count > 0 ? 'amber' : 'green',
  };
}

function shareLabel(rate: number): string {
  const pct = rate * 100;
  if (pct > 0 && pct < 0.1) return '<0.1%';
  return `${pct.toFixed(pct < 10 ? 1 : 0)}%`;
}

/** ESI calls answered with a 4xx, as a share of all recorded ESI calls. */
export function clientErrorLine(summary: EsiClientErrorSummary): StatusLine {
  const worst = summary.groups[0];
  const counts = `${formatQuantity(summary.errors)} of ${formatQuantity(summary.calls)} calls`;
  return {
    id: 'esi-4xx',
    label: 'ESI 4xx answers',
    value: summary.rate === null ? '—' : shareLabel(summary.rate),
    note: worst === undefined ? counts : `${counts} · most from ${worst.feature} · ${worst.operation}`,
    level: summary.rate === null ? 'neutral' : targetLevel(summary.rate, ESI_CLIENT_ERROR_TARGET),
  };
}

export function derivePressureLines(input: {
  esiSuccess: number | null;
  esiSamples?: number;
  budgetExhaustions: number;
  fallback: FallbackRateData;
  degradation: DegradationCallerCount[];
  queue: EsiRefreshQueueStat[];
  clientErrors: EsiClientErrorSummary;
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
    clientErrorLine(input.clientErrors),
    countLine('exhaustions', 'Budget-blocked refreshes', input.budgetExhaustions),
    {
      id: 'fallback',
      label: 'Scheduled Fuzzwork share',
      value: formatFallbackShare(input.fallback),
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

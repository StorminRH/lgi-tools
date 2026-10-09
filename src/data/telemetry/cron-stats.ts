import type { CronOutcomeCount, FallbackRateData, RefreshVolumePoint } from './types';

/** The scheduled jobs the admin pages track, each with its own usage action. */
export const CRON_ACTIONS = ['cron_prices', 'cron_sde', 'cron_gsc', 'cron_housekeeping'] as const;
export type CronAction = (typeof CRON_ACTIONS)[number];

export type CronOutcomes = Record<CronAction, CronOutcomeCount[]>;

/** One grouped row of cron runs: an action and the outcome it recorded. */
export interface CronOutcomeRow extends CronOutcomeCount {
  action: string;
}

/**
 * Splits the grouped runs by action, keeping each action's rows in the
 * order they arrived (most frequent first). Every action gets a list, empty
 * when it did not run.
 */
export function splitCronOutcomes(rows: readonly CronOutcomeRow[]): CronOutcomes {
  const outcomes = Object.fromEntries(CRON_ACTIONS.map((action) => [action, [] as CronOutcomeCount[]])) as CronOutcomes;
  for (const row of rows) {
    outcomes[row.action as CronAction]?.push({
      outcome: row.outcome,
      count: Number(row.count),
      avgDurationMs: Math.round(Number(row.avgDurationMs)),
    });
  }
  return outcomes;
}

/** Price-cron refresh totals for one UTC day. */
export interface PriceRefreshDay {
  /** UTC day, `YYYY-MM-DD`. */
  day: string;
  esi: number;
  fallback: number;
  fetched: number;
  written: number;
}

export function fallbackRate(days: readonly PriceRefreshDay[]): FallbackRateData {
  return {
    esi: days.reduce((total, day) => total + day.esi, 0),
    fallback: days.reduce((total, day) => total + day.fallback, 0),
    perDay: days.map(({ day, esi, fallback }) => ({ day, esi, fallback })),
  };
}

export function refreshVolume(days: readonly PriceRefreshDay[]): RefreshVolumePoint[] {
  return days.map(({ day, fetched, written }) => ({ day, fetched, written }));
}

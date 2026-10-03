import { cacheLife } from 'next/cache';
import { ESI_AVAILABILITY_TARGET, targetLevel } from '@/data/telemetry/health-metrics';
import { getEsiAvailability } from '@/data/telemetry/queries';
import { ESI_BUDGET_FLOOR } from '@/platform/esi';
import { readEsiBudgetSnapshot } from '@/platform/esi/scoreboard';
import { ESI_ERROR_CEILING } from '@/platform/esi/scoreboard/types';

const WINDOW_MS = 3_600_000;
const ESI_HEALTH_CACHE = { stale: 60, revalidate: 60, expire: 600 };

/**
 * How ESI is treating LGI, read from the numbers the admin ESI page shows:
 * the share of ESI-dependent operations that succeeded over the last hour,
 * and the error budget left before LGI pauses its calls.
 */
export interface EsiHealth {
  availability:
    | { state: 'measured'; rate: number; level: 'green' | 'amber' | 'red' }
    | { state: 'idle' }
    | { state: 'unknown' };
  budget:
    | { state: 'live' | 'paused'; remaining: number; ceiling: number }
    | { state: 'unknown' };
}

async function readAvailability(now: number): Promise<EsiHealth['availability']> {
  try {
    const { rate } = await getEsiAvailability({ from: new Date(now - WINDOW_MS), to: new Date(now) });
    if (rate === null) return { state: 'idle' };
    return { state: 'measured', rate, level: targetLevel(rate, ESI_AVAILABILITY_TARGET) };
  } catch (error) {
    console.error('[esi-health] availability read failed', error);
    return { state: 'unknown' };
  }
}

async function readBudget(): Promise<EsiHealth['budget']> {
  try {
    const snapshot = await readEsiBudgetSnapshot();
    // With no scoreboard, ESI dispatch is paused; the admin page reads it the same way.
    if (snapshot === null) return { state: 'paused', remaining: 0, ceiling: ESI_ERROR_CEILING };
    const remaining = snapshot.effectiveRemaining;
    return {
      state: remaining < ESI_BUDGET_FLOOR ? 'paused' : 'live',
      remaining,
      ceiling: ESI_ERROR_CEILING,
    };
  } catch (error) {
    console.error('[esi-health] budget read failed', error);
    return { state: 'unknown' };
  }
}

export async function getEsiHealth(): Promise<EsiHealth> {
  'use cache: remote';
  cacheLife(ESI_HEALTH_CACHE);
  const [availability, budget] = await Promise.all([readAvailability(Date.now()), readBudget()]);
  return { availability, budget };
}

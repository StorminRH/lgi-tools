import { after } from 'next/server';
import { logUsageEvent } from './log';
import type { UsageAction } from './types';

export interface CostTimer {
  startedAt: number;
}

export function startCostTimer(): CostTimer {
  return { startedAt: performance.now() };
}

export function elapsedCostTimer(timer: CostTimer): number {
  return performance.now() - timer.startedAt;
}

export async function recordCostMetric(
  action: UsageAction,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await logUsageEvent({ action, metadata });
  } catch (error) {
    console.error('[cost-metrics] telemetry write failed', error);
  }
}

export function emitCostMetric(
  action: UsageAction,
  metadata: Record<string, unknown>,
): void {
  try {
    after(() => recordCostMetric(action, metadata));
  } catch (error) {
    console.error('[cost-metrics] telemetry scheduling failed', error);
  }
}

/**
 * Emits one cost metric when `promise` settles, timed from `timer`, and hands
 * back the same promise. `resultMetadata` adds fields read from the resolved
 * value to the succeeded event only.
 */
export function observeCostPromise<T>(
  promise: Promise<T>,
  action: UsageAction,
  metadata: Record<string, unknown>,
  timer: CostTimer = startCostTimer(),
  resultMetadata?: (value: T) => Record<string, unknown>,
): Promise<T> {
  void promise.then(
    (value) => {
      const durationMs = elapsedCostTimer(timer);
      emitCostMetric(action, {
        ...metadata,
        ...describeResult(value, resultMetadata),
        outcome: 'succeeded',
        durationMs,
      });
    },
    () => emitCostMetric(action, { ...metadata, outcome: 'failed', durationMs: elapsedCostTimer(timer) }),
  );
  return promise;
}

// Runs inside a detached then-callback, so a throwing hook would surface as an
// unhandled rejection and drop the event. It loses only its own fields instead.
function describeResult<T>(
  value: T,
  resultMetadata: ((value: T) => Record<string, unknown>) | undefined,
): Record<string, unknown> {
  if (!resultMetadata) return {};
  try {
    return resultMetadata(value);
  } catch (error) {
    console.error('[cost-metrics] result metadata failed', error);
    return {};
  }
}

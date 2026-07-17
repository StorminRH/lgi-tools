import { after } from 'next/server';
import { logUsageEvent } from './queries';
import type { UsageAction } from './types';

/** Opaque monotonic start marker used to calculate elapsed cost milliseconds. */
export interface CostTimer {
  startedAt: number;
}

/** Captures the monotonic start time for one cost observation. */
export function startCostTimer(): CostTimer {
  return { startedAt: performance.now() };
}

/** Returns elapsed whole milliseconds from a cost timer using the monotonic clock. */
export function elapsedCostTimer(timer: CostTimer): number {
  return performance.now() - timer.startedAt;
}

/**
 * Persists one bounded cost metric through the telemetry owner; caller-supplied metadata must
 * already satisfy the closed privacy-safe vocabulary.
 */
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

/**
 * Schedules one best-effort cost metric after the response lifetime without allowing telemetry
 * failure to affect product work.
 */
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
 * Measures an awaited operation, emits its outcome and elapsed milliseconds, then preserves the
 * original resolved value or rejection.
 */
export function observeCostPromise<T>(
  promise: Promise<T>,
  action: UsageAction,
  metadata: Record<string, unknown>,
  timer: CostTimer = startCostTimer(),
): Promise<T> {
  void promise.then(
    () => emitCostMetric(action, { ...metadata, outcome: 'succeeded', durationMs: elapsedCostTimer(timer) }),
    () => emitCostMetric(action, { ...metadata, outcome: 'failed', durationMs: elapsedCostTimer(timer) }),
  );
  return promise;
}

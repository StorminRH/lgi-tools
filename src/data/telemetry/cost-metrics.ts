import { after } from 'next/server';
import { logUsageEvent } from './queries';
import type { UsageAction } from './types';

export interface CostTimer {
  startedAt: number;
}

export function startCostTimer(): CostTimer {
  return { startedAt: Date.now() };
}

export function elapsedCostTimer(timer: CostTimer): number {
  return Date.now() - timer.startedAt;
}

export function emitCostMetric(
  action: UsageAction,
  metadata: Record<string, unknown>,
): void {
  try {
    after(async () => {
      try {
        await logUsageEvent({ action, metadata });
      } catch (error) {
        console.error('[cost-metrics] telemetry write failed', error);
      }
    });
  } catch (error) {
    console.error('[cost-metrics] telemetry scheduling failed', error);
  }
}

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

import { after } from 'next/server';
import { recordCostMetric } from '@/data/telemetry/cost-metrics';
import { setWorkDeferrer } from '@/lib/deferred-work';
import { configureNeonColdStartMetricSink } from '@/lib/neon-cold-start-retry';

export function registerNeonColdStartTelemetry(): void {
  configureNeonColdStartMetricSink((metadata) =>
    recordCostMetric('neon_cold_start_retry', { ...metadata }),
  );
}

/** Lets lower layers move bookkeeping past the response; outside a request scope `after` throws and the caller awaits instead. */
export function registerAfterResponseWork(): void {
  setWorkDeferrer((task) => {
    try {
      after(task);
      return true;
    } catch {
      return false;
    }
  });
}

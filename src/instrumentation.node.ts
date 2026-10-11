import { recordCostMetric } from '@/data/telemetry/cost-metrics';
import { deferAfterResponse } from '@/lib/after-response';
import { setWorkDeferrer } from '@/lib/deferred-work';
import { configureNeonColdStartMetricSink } from '@/lib/neon-cold-start-retry';

export function registerNeonColdStartTelemetry(): void {
  configureNeonColdStartMetricSink((metadata) =>
    recordCostMetric('neon_cold_start_retry', { ...metadata }),
  );
}

/** Lets lower layers move bookkeeping past the response; outside a request scope the caller awaits it instead. */
export function registerAfterResponseWork(): void {
  setWorkDeferrer(deferAfterResponse);
}

import { emitCostMetric } from '@/data/telemetry/cost-metrics';
import { configureNeonColdStartMetricSink } from '@/lib/neon-cold-start-retry';

export function registerNeonColdStartTelemetry(): void {
  configureNeonColdStartMetricSink((metadata) => {
    emitCostMetric('neon_cold_start_retry', { ...metadata });
  });
}

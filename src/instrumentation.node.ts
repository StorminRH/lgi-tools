import { recordCostMetric } from '@/data/telemetry/cost-metrics';
import { configureNeonColdStartMetricSink } from '@/lib/neon-cold-start-retry';

export function registerNeonColdStartTelemetry(): void {
  configureNeonColdStartMetricSink((metadata) =>
    recordCostMetric('neon_cold_start_retry', { ...metadata }),
  );
}

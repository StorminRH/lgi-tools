import { recordCostMetric } from '@/data/telemetry/cost-metrics';
import { configureNeonColdStartMetricSink } from '@/lib/neon-cold-start-retry';

/**
 * Installs the Neon cold-start retry metric sink once for the Node runtime; repeated
 * instrumentation registration remains idempotent.
 */
export function registerNeonColdStartTelemetry(): void {
  configureNeonColdStartMetricSink((metadata) =>
    recordCostMetric('neon_cold_start_retry', { ...metadata }),
  );
}

import { logUsageEvent } from '@/data/telemetry/queries';
import { configureNeonColdStartMetricSink } from '@/lib/neon-cold-start-retry';

export function registerNeonColdStartTelemetry(): void {
  configureNeonColdStartMetricSink((metadata) =>
    logUsageEvent({ action: 'neon_cold_start_retry', metadata: { ...metadata } }),
  );
}

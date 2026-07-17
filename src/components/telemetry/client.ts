// Tiny client-side helper for POSTing to /api/telemetry. <TelemetryReporter>
// (page_view) is the live consumer; the historical terminal_search action is
// still read by the admin telemetry queries. The beacon/fetch fallback logic
// lives here in one place. Server-side callers go through logUsageEvent()
// directly in queries.ts.

import { telemetryEndpoint } from '@/data/telemetry/api-contract';
import { apiFetch } from '@/lib/api-client';
import { buildTelemetryPayload, type TelemetryInput } from './telemetry-payload';

/**
 * Queues one privacy-bounded telemetry event with keepalive delivery; browser or network failure
 * is intentionally ignored so navigation is never blocked.
 */
export function postTelemetry(input: TelemetryInput): void {
  const payload = buildTelemetryPayload(input);

  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const ok = navigator.sendBeacon(telemetryEndpoint.path, blob);
    if (ok) return;
  }

  void apiFetch(telemetryEndpoint, { body: payload, keepalive: true }).catch(() => {});
}

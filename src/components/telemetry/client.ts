// Tiny client-side helper for POSTing to /api/telemetry. <TelemetryReporter>
// (page_view) is the live consumer; the historical terminal_search action is
// still read by the admin telemetry queries. The beacon/fetch fallback logic
// lives here in one place. Server-side callers go through logUsageEvent()
// directly in queries.ts.

import { z } from 'zod';
import { telemetryEndpoint, telemetryRequestSchema } from '@/data/telemetry/api-contract';
import { apiFetch } from '@/lib/api-client';

type PostInput = z.input<typeof telemetryRequestSchema>;

export function postTelemetry({ action, metadata }: PostInput): void {
  const payload = { action, metadata: metadata ?? {} };

  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const ok = navigator.sendBeacon(telemetryEndpoint.path, blob);
    if (ok) return;
  }

  void apiFetch(telemetryEndpoint, { body: payload, keepalive: true }).catch(() => {});
}

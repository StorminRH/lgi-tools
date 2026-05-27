// Tiny client-side helper for POSTing to /api/telemetry. Two consumers so
// far — <TelemetryReporter> for page_view, <SitesTerminalSearch> for
// terminal_search — share this so the beacon/fetch fallback logic lives
// in one place. Server-side callers go through logUsageEvent() directly
// in queries.ts.

import type { UsageAction } from '@/data/telemetry/types';

interface PostInput {
  action: UsageAction;
  metadata?: Record<string, unknown>;
}

export function postTelemetry({ action, metadata }: PostInput): void {
  const body = JSON.stringify({ action, metadata: metadata ?? {} });

  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const blob = new Blob([body], { type: 'application/json' });
    const ok = navigator.sendBeacon('/api/telemetry', blob);
    if (ok) return;
  }

  void fetch('/api/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

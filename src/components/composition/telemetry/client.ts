import { telemetryEndpoint } from '@/data/telemetry/api-contract';
import { apiFetch } from '@/transport/api-client';
import {
  buildTelemetryPayload,
  type TelemetryInput,
} from '@/components/telemetry/telemetry-payload';

export function postTelemetry(input: TelemetryInput): void {
  const payload = buildTelemetryPayload(input);

  if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const ok = navigator.sendBeacon(telemetryEndpoint.path, blob);
    if (ok) return;
  }

  void apiFetch(telemetryEndpoint, { body: payload, keepalive: true }).catch(() => {});
}

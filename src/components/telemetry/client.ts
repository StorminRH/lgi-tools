import { telemetryEndpoint } from '@/data/telemetry/api-contract';
import { postBeacon } from '@/transport/beacon';
import type { RequestInputOf } from '@/transport/endpoint';

export function postTelemetry({ action, metadata }: RequestInputOf<typeof telemetryEndpoint>): void {
  postBeacon(telemetryEndpoint, { action, metadata: metadata ?? {} });
}

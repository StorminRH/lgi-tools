import { telemetryEndpoint } from '@/data/telemetry/api-contract';
import { postBeacon } from '@/transport/beacon';
import {
  buildTelemetryPayload,
  type TelemetryInput,
} from '@/components/telemetry/telemetry-payload';

export function postTelemetry(input: TelemetryInput): void {
  postBeacon(telemetryEndpoint, buildTelemetryPayload(input));
}

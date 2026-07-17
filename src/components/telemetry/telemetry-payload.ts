import type { z } from 'zod';
import type { telemetryRequestSchema } from '@/data/telemetry/api-contract';

export type TelemetryInput = z.input<typeof telemetryRequestSchema>;

/**
 * Build the telemetry POST body. Normalizes an absent `metadata` to an empty
 * object so the beacon/fetch payload is always a complete \{ action, metadata \}.
 */
export function buildTelemetryPayload({ action, metadata }: TelemetryInput) {
  return { action, metadata: metadata ?? {} };
}

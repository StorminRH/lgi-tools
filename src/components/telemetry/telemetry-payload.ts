import type { z } from 'zod';
import type { telemetryRequestSchema } from '@/data/telemetry/api-contract';

/**
 * Caller input shape accepted by components; the receiving boundary owns validation and
 * normalization before the values move inward.
 */
export type TelemetryInput = z.input<typeof telemetryRequestSchema>;

/**
 * Build the telemetry POST body. Normalizes an absent `metadata` to an empty
 * object so the beacon/fetch payload is always a complete \{ action, metadata \}.
 */
export function buildTelemetryPayload({ action, metadata }: TelemetryInput) {
  return { action, metadata: metadata ?? {} };
}

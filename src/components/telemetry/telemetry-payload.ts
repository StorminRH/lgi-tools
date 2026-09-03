import type { z } from 'zod';
import type { telemetryRequestSchema } from '@/data/telemetry/api-contract';

export type TelemetryInput = z.input<typeof telemetryRequestSchema>;

export function buildTelemetryPayload({ action, metadata }: TelemetryInput) {
  return { action, metadata: metadata ?? {} };
}

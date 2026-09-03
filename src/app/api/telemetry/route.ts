import type { NextRequest } from 'next/server';
import {
  telemetryEndpoint,
  telemetryRequestSchema,
} from '@/data/telemetry/api-contract';
import { TELEMETRY_LIMIT_PER_MINUTE } from '@/data/telemetry/constants';
import { logUsageEvent } from '@/data/telemetry/queries';
import { getSessionCharacterId } from '@/platform/auth/session';
import { validationFailure } from '@/lib/failure';
import { checkRateLimit } from '@/lib/rate-limit';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

const MAX_METADATA_BYTES = 2048;

// authz: public
export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await readJsonBody(request, telemetryRequestSchema);
  if (!parsed.ok) {
    return apiResponse(telemetryEndpoint, 400, parsed.failure);
  }

  const safeMetadata = parsed.data.metadata ?? {};

  if (parsed.data.metadata !== undefined) {
    const serialised = JSON.stringify(safeMetadata);
    if (new TextEncoder().encode(serialised).length > MAX_METADATA_BYTES) {
      return apiResponse(
        telemetryEndpoint,
        400,
        validationFailure('metadata_too_large', 'metadata too large'),
      );
    }
  }

  const limit = await checkRateLimit(request, {
    name: 'telemetry',
    perMinute: TELEMETRY_LIMIT_PER_MINUTE,
  });
  if (!limit.ok) {
    return apiResponse(telemetryEndpoint, 429, limit.failure);
  }

  void getSessionCharacterId()
    .then((characterId) =>
      logUsageEvent({
        action: parsed.data.action,
        characterId,
        metadata: safeMetadata,
      }),
    )
    .catch((err) => console.error('[telemetry] failed to record usage event', err));

  return apiResponse(telemetryEndpoint, 204);
}

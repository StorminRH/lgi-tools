import type { NextRequest } from 'next/server';
import { telemetryRequestSchema } from '@/data/telemetry/api-contract';
import { TELEMETRY_LIMIT_PER_MINUTE } from '@/data/telemetry/constants';
import { logUsageEvent } from '@/data/telemetry/queries';
import { getSessionCharacterId } from '@/features/auth/session';
import { clientIdentifier, rateLimit, type RateLimitedBody } from '@/lib/rate-limit';
import { parseJsonBody } from '@/lib/route-body';

// Hard cap on serialised metadata to keep one bad payload from filling the
// table. 2KB is generous for page-view + search shapes; rejecting larger
// payloads keeps a misbehaving client from running away.
const MAX_METADATA_BYTES = 2048;

// Silent first-party tracker. Accepts JSON { action, metadata? } and returns
// 204. Shape is validated synchronously (400 before any write) so a
// misconfigured client surfaces in the network tab. A per-IP rate limit (the
// only public write path that was missing one) bounds a scripted flood that
// would skew the analytics this table feeds. The characterId comes from the
// Better Auth session lookup, and the row is written fire-and-forget — the
// beacon's caller ignores the response, so we never block the 204 on the
// insert, matching every other logUsageEvent caller.
// authz: public
export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await parseJsonBody(request, telemetryRequestSchema);
  if (!parsed.ok) return parsed.response;

  const safeMetadata = parsed.data.metadata ?? {};
  // Byte-cap is a separate concern from shape validation; Zod can't bound
  // a JSON.stringify length without a refine, and the refine would force
  // double-serialising. Leave it as a post-parse check.
  if (parsed.data.metadata !== undefined) {
    const serialised = JSON.stringify(safeMetadata);
    if (new TextEncoder().encode(serialised).length > MAX_METADATA_BYTES) {
      return new Response('metadata too large', { status: 400 });
    }
  }

  const limit = await rateLimit(clientIdentifier(request.headers), {
    name: 'telemetry',
    perMinute: TELEMETRY_LIMIT_PER_MINUTE,
  });
  if (!limit.ok) {
    return Response.json(
      { error: 'rate_limited', retryAfter: limit.retryAfter } satisfies RateLimitedBody,
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfter) },
      },
    );
  }

  // Fire-and-forget: read the id from the session and write the row without
  // blocking the response. Telemetry must never break a user flow, so any
  // failure is swallowed (logged so a genuine bug stays visible) and the 204
  // returns immediately regardless.
  void getSessionCharacterId()
    .then((characterId) =>
      logUsageEvent({
        action: parsed.data.action,
        characterId,
        metadata: safeMetadata,
      }),
    )
    .catch((err) => console.error('[telemetry] failed to record usage event', err));

  return new Response(null, { status: 204 });
}

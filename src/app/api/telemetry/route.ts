import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { TELEMETRY_LIMIT_PER_MINUTE } from '@/data/telemetry/constants';
import { logUsageEvent } from '@/data/telemetry/queries';
import { CLIENT_USAGE_ACTIONS } from '@/data/telemetry/types';
import { getSessionCharacterId } from '@/features/auth/session';
import { clientIdentifier, rateLimit } from '@/lib/rate-limit';

// Hard cap on serialised metadata to keep one bad payload from filling the
// table. 2KB is generous for page-view + search shapes; rejecting larger
// payloads keeps a misbehaving client from running away.
const MAX_METADATA_BYTES = 2048;

// Validates against CLIENT_USAGE_ACTIONS, not the full set: server-only
// actions (cron health signals, auth/admin audit) must not be forgeable by a
// client POST, or the health/audit rows they write could be polluted.
const telemetrySchema = z.object({
  action: z.enum(CLIENT_USAGE_ACTIONS),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Silent first-party tracker. Accepts JSON { action, metadata? } and returns
// 204. Shape is validated synchronously (400 before any write) so a
// misconfigured client surfaces in the network tab. A per-IP rate limit (the
// only public write path that was missing one) bounds a scripted flood that
// would skew the analytics this table feeds. The characterId comes straight
// from the decrypted cookie (no DB read), and the row is written
// fire-and-forget — the beacon's caller ignores the response, so we never
// block the 204 on the insert, matching every other logUsageEvent caller.
// authz: public
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const parsed = telemetrySchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid body';
    return new Response(detail, { status: 400 });
  }

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
      { error: 'rate_limited', retryAfter: limit.retryAfter },
      {
        status: 429,
        headers: { 'Retry-After': String(limit.retryAfter) },
      },
    );
  }

  // Fire-and-forget: read the id from the cookie and write the row without
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

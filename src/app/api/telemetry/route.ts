import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { logUsageEvent } from '@/data/telemetry/queries';
import { USAGE_ACTIONS } from '@/data/telemetry/types';
import { getSession } from '@/features/auth/session';

// Hard cap on serialised metadata to keep one bad payload from filling the
// table. 2KB is generous for page-view + search shapes; rejecting larger
// payloads keeps a misbehaving client from running away.
const MAX_METADATA_BYTES = 2048;

const telemetrySchema = z.object({
  action: z.enum(USAGE_ACTIONS),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Silent first-party tracker. Accepts JSON { action, metadata? }, reads the
// session for characterId (null when logged out — anonymous reach matters
// for partner-program reporting), and returns 204 on success. Validation
// failures return 400 so a misconfigured client surfaces in the network
// tab instead of polluting the table.
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
    if (Buffer.byteLength(serialised, 'utf8') > MAX_METADATA_BYTES) {
      return new Response('metadata too large', { status: 400 });
    }
  }

  const session = await getSession();

  try {
    await logUsageEvent({
      action: parsed.data.action,
      characterId: session?.characterId ?? null,
      metadata: safeMetadata,
    });
  } catch {
    // Telemetry failures must never break user flows. Swallow and 204.
    return new Response(null, { status: 204 });
  }

  return new Response(null, { status: 204 });
}

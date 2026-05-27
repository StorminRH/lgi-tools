import type { NextRequest } from 'next/server';
import { logUsageEvent } from '@/data/telemetry/queries';
import { USAGE_ACTIONS, type UsageAction } from '@/data/telemetry/types';
import { getSession } from '@/features/auth/session';

// Hard cap on serialised metadata to keep one bad payload from filling the
// table. 2KB is generous for page-view + search shapes; rejecting larger
// payloads keeps a misbehaving client from running away.
const MAX_METADATA_BYTES = 2048;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

  if (!isRecord(body)) {
    return new Response('Body must be a JSON object', { status: 400 });
  }

  const { action, metadata } = body;
  if (typeof action !== 'string' || !(USAGE_ACTIONS as readonly string[]).includes(action)) {
    return new Response('Invalid action', { status: 400 });
  }

  let safeMetadata: Record<string, unknown> = {};
  if (metadata !== undefined) {
    if (!isRecord(metadata)) {
      return new Response('metadata must be a JSON object', { status: 400 });
    }
    const serialised = JSON.stringify(metadata);
    if (Buffer.byteLength(serialised, 'utf8') > MAX_METADATA_BYTES) {
      return new Response('metadata too large', { status: 400 });
    }
    safeMetadata = metadata;
  }

  const session = await getSession();

  try {
    await logUsageEvent({
      action: action as UsageAction,
      characterId: session?.characterId ?? null,
      metadata: safeMetadata,
    });
  } catch {
    // Telemetry failures must never break user flows. Swallow and 204.
    return new Response(null, { status: 204 });
  }

  return new Response(null, { status: 204 });
}

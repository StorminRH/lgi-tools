import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { setCharacterPreference } from '@/features/auth/queries';
import { getSession } from '@/features/auth/session';

// Max bytes for a single preference value (after JSON stringify). The
// preferences blob is a per-character convenience, not a general data
// store — keeping the ceiling low prevents one bad client from bloating
// the characters table.
const MAX_VALUE_BYTES = 4096;
const MAX_KEY_LENGTH = 64;

const preferenceSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(MAX_KEY_LENGTH)
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, 'key must match [a-zA-Z][a-zA-Z0-9_-]*'),
  value: z.unknown(),
});

// Generic per-character preference setter. Accepts JSON { key, value }
// — key is a short alphanumeric slug, value is any JSON-serialisable
// payload. Performs a top-level JSONB merge so other keys survive.
// Requires a session; logged-out callers get 401.
//
// 2.8.4 ships this without a UI consumer. First real consumer (theme,
// sticky tab, etc.) lands in a later version.
export async function POST(request: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const parsed = preferenceSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid body';
    return new Response(detail, { status: 400 });
  }

  const { key, value } = parsed.data;

  // Value must be JSON-serialisable. We accept undefined-as-null but reject
  // values whose serialised form is too large.
  let serialised: string;
  try {
    serialised = JSON.stringify(value ?? null);
  } catch {
    return new Response('Value is not JSON-serialisable', { status: 400 });
  }
  if (Buffer.byteLength(serialised, 'utf8') > MAX_VALUE_BYTES) {
    return new Response('Value too large', { status: 400 });
  }

  const updated = await setCharacterPreference(session.characterId, key, value ?? null);
  if (updated === null) {
    return new Response('Character not found', { status: 404 });
  }

  return Response.json({ ok: true, preferences: updated });
}

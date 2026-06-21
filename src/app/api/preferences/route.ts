import type { NextRequest } from 'next/server';
import {
  putPreferenceRequestSchema,
  type GetPreferencesResponse,
} from '@/data/preferences/api-contract';
import { getPreferencesForUser, upsertPreference } from '@/data/preferences/queries';
import { getCurrentUserId } from '@/features/auth/session';
import { validatePreferenceValue } from '@/lib/preferences';

// Both handlers are scoped to the authenticated caller's own user rows; an
// anonymous GET returns an empty set (the client falls back to localStorage) and
// an anonymous POST is rejected.
// authz: auth
//
// GET /api/preferences — the caller's saved preferences (their own rows only). No
// user input to validate.
export async function GET(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ preferences: [] } satisfies GetPreferencesResponse);
  }
  const preferences = await getPreferencesForUser(userId);
  return Response.json({ preferences } satisfies GetPreferencesResponse);
}

// POST /api/preferences — upsert ONE of the caller's preferences. Body
// { key, value }: the key must be a known registry key (enum) and the value must
// match that key's schema (validatePreferenceValue — the server trust boundary,
// so a forged body can't write garbage). 401 for anon, 204 on success.
export async function POST(request: NextRequest): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const parsed = putPreferenceRequestSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const detail = firstIssue
      ? `${firstIssue.path.join('.') || 'body'}: ${firstIssue.message}`
      : 'invalid body';
    return new Response(detail, { status: 400 });
  }

  if (!validatePreferenceValue(parsed.data.key, parsed.data.value)) {
    return new Response('invalid value for key', { status: 400 });
  }

  await upsertPreference(userId, parsed.data.key, parsed.data.value);
  return new Response(null, { status: 204 });
}

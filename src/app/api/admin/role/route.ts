import type { NextRequest } from 'next/server';
import {
  getCharacterById,
  setCharacterRole,
} from '@/features/auth/queries';
import { CHARACTER_ROLES, type CharacterRole } from '@/features/auth/schema';
import { getSession, isAdmin } from '@/features/auth/session';
import { logUsageEvent } from '@/data/telemetry/queries';

const MAX_QUERY_LENGTH = 200;
const CONTROL_CHARS = /\p{C}/gu;
const POSITIVE_INTEGER = /^[1-9]\d{0,18}$/;

function sanitiseQuery(raw: FormDataEntryValue | null): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.replace(CONTROL_CHARS, '').trim();
  if (cleaned.length === 0) return undefined;
  return cleaned.slice(0, MAX_QUERY_LENGTH);
}

function buildRedirect(request: NextRequest, query: string | undefined): URL {
  const url = new URL('/admin', request.url);
  if (query) url.searchParams.set('q', query);
  return url;
}

// POST-only. The dashboard's <RoleToggleForm> submits hidden inputs:
//   characterId, nextRole, q (optional).
// Independent isAdmin() gate — never trust a UI-level disable; the handler
// is the source of truth for who can mutate roles.
export async function POST(request: NextRequest): Promise<Response> {
  const session = await getSession();
  if (!isAdmin(session)) {
    return new Response('Forbidden', { status: 403 });
  }

  const form = await request.formData();

  const rawCharacterId = form.get('characterId');
  if (typeof rawCharacterId !== 'string' || !POSITIVE_INTEGER.test(rawCharacterId)) {
    return new Response('Invalid characterId', { status: 400 });
  }
  const characterId = Number(rawCharacterId);
  if (!Number.isSafeInteger(characterId)) {
    return new Response('characterId out of range', { status: 400 });
  }

  const rawNextRole = form.get('nextRole');
  if (
    typeof rawNextRole !== 'string' ||
    !(CHARACTER_ROLES as readonly string[]).includes(rawNextRole)
  ) {
    return new Response('Invalid nextRole', { status: 400 });
  }
  const nextRole = rawNextRole as CharacterRole;

  // Self-toggle guard. The UI disables this button on the viewer's own row,
  // but a crafted POST would still arrive here — this is the real defense.
  if (characterId === session!.characterId) {
    return new Response('Cannot toggle your own role', { status: 400 });
  }

  const target = await getCharacterById(characterId);
  if (!target) {
    return new Response('Character not found', { status: 404 });
  }

  const previousRole = target.role;
  await setCharacterRole(characterId, nextRole);

  void logUsageEvent({
    action: 'role_change',
    characterId: session!.characterId,
    metadata: {
      actorCharacterId: session!.characterId,
      targetCharacterId: characterId,
      from: previousRole,
      to: nextRole,
    },
  }).catch((err) => console.error('[admin/role] telemetry write failed', err));

  const query = sanitiseQuery(form.get('q'));
  return Response.redirect(buildRedirect(request, query), 303);
}

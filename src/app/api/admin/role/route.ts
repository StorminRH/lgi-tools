import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getCharacterById,
  setCharacterRole,
} from '@/features/auth/queries';
import { CHARACTER_ROLES } from '@/features/auth/schema';
import { getSession, isAdmin } from '@/features/auth/session';
import { logUsageEvent } from '@/data/telemetry/queries';

const MAX_QUERY_LENGTH = 200;
const CONTROL_CHARS = /\p{C}/gu;

// Form payload from <RoleToggleForm>. characterId arrives as a numeric
// string in the FormData; transform-to-Number gates on the regex first so
// junk like "12abc" never reaches parseInt's silent truncation. `q`
// (optional search-state preserver) is loosely validated here — the
// post-parse sanitiseQuery() does the real cleaning.
const roleFormSchema = z.object({
  characterId: z
    .string()
    .regex(/^[1-9]\d{0,18}$/)
    .transform(Number)
    .pipe(z.number().int().positive().refine(Number.isSafeInteger)),
  nextRole: z.enum(CHARACTER_ROLES),
  q: z.string().max(MAX_QUERY_LENGTH * 4).optional(),
});

function sanitiseQuery(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
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
  const parsed = roleFormSchema.safeParse({
    characterId: form.get('characterId'),
    nextRole: form.get('nextRole'),
    q: form.get('q') ?? undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `Invalid ${issue.path.join('.') || 'field'}` : 'Invalid form';
    return new Response(detail, { status: 400 });
  }
  const { characterId, nextRole } = parsed.data;

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

  const query = sanitiseQuery(parsed.data.q);
  return Response.redirect(buildRedirect(request, query), 303);
}

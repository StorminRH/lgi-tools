import type { NextRequest } from 'next/server';
import { getSkillLevelsForCharacterOnView } from '@/db/skills-sync';
import { getCurrentUserId } from '@/features/auth/session';
import {
  skillLevelsRequestSchema,
  type SkillLevelsBadRequest,
  type SkillLevelsResponse,
} from '@/features/industry-planner/api-contract';

// POST /api/industry/skill-levels
// Body: { characterId }
//
// The selected build character's trained ACTIVE skill levels for the planner's
// skills→time lever (3.7.19.1), read from the skills tracker's Neon store with
// the same stale-gated on-view write-behind refresh as the skills page. The
// character must be one of the caller's linked characters (the user id comes
// from the session, never the body). Every degraded arm — anonymous caller,
// someone else's character, never-synced or pre-column row — answers
// `levels: null` (200): the planner fails open to the no-skill baseline.
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' } satisfies SkillLevelsBadRequest, {
      status: 400,
    });
  }

  const parsed = skillLevelsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_request', issues: parsed.error.issues } satisfies SkillLevelsBadRequest,
      { status: 400 },
    );
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ levels: null } satisfies SkillLevelsResponse);
  }
  const levels = await getSkillLevelsForCharacterOnView(userId, parsed.data.characterId);
  return Response.json({ levels } satisfies SkillLevelsResponse);
}

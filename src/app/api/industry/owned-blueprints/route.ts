import type { NextRequest } from 'next/server';
import { getOwnedBlueprintsOnView } from '@/db/owned-blueprints-sync';
import {
  ownedBlueprintsRequestSchema,
  type OwnedBlueprintsBadRequest,
} from '@/features/industry-planner/api-contract';
import type { OwnedBlueprintsResponse } from '@/features/industry-planner/types';
import { getCurrentUserId } from '@/features/auth/session';

// POST /api/industry/owned-blueprints
// Body: { blueprintTypeIds } — the blueprints in the planned build.
//
// Per-pick owned-ME read for the planner's owned-blueprint cost overlay: the
// caller's effective ME (best owned copy) for each requested blueprint they own.
// Scoped to the authenticated caller's own owners (the user id comes from the
// session, never the body); an anonymous caller gets an empty set, so the client
// applies ME0 (the gross path). Returns only the OWNED blueprints among those
// requested — an unowned one is simply absent.
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_json' } satisfies OwnedBlueprintsBadRequest, {
      status: 400,
    });
  }

  const parsed = ownedBlueprintsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid_request', issues: parsed.error.issues } satisfies OwnedBlueprintsBadRequest,
      { status: 400 },
    );
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ blueprints: [] } satisfies OwnedBlueprintsResponse);
  }

  const owned = await getOwnedBlueprintsOnView(userId);
  const blueprints = parsed.data.blueprintTypeIds
    .map((blueprintTypeId) => {
      const summary = owned.get(blueprintTypeId);
      return summary ? { blueprintTypeId, me: summary.me } : null;
    })
    .filter((entry): entry is { blueprintTypeId: number; me: number } => entry !== null);

  return Response.json({ blueprints } satisfies OwnedBlueprintsResponse);
}

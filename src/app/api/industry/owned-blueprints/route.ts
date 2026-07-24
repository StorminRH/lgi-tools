import type { NextRequest } from 'next/server';
import { getOwnedBlueprintDetailOnView } from '@/composition/sync/owned-blueprints-sync';
import {
  ownedBlueprintsRequestSchema,
  type OwnedBlueprintsBadRequest,
} from '@/features/industry-planner/api-contract';
import type { OwnedBlueprintsResponse } from '@/features/industry-planner/types';
import { getCurrentUserId } from '@/platform/auth/session';
import { parseJsonBody } from '@/transport/route-body';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';

/**
 * POST /api/industry/owned-blueprints
 * Body: \{ blueprintTypeIds \} — the blueprints in the planned build.
 *
 * Per-pick owned-blueprint read for the planner's cost overlay + orb popover: the
 * caller's effective ME (best owned copy) for each requested blueprint they own,
 * plus that copy's TE / owner / location as readout detail (resolved server-side
 * in one bounded pass). Scoped to the authenticated caller's own owners (the user
 * id comes from the session, never the body); an anonymous caller gets an empty
 * set, so the client applies ME0 (the gross path). Returns only the OWNED
 * blueprints among those requested — an unowned one is simply absent.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await parseJsonBody(request, ownedBlueprintsRequestSchema, {
    invalidJson: () =>
      Response.json({ error: 'invalid_json' } satisfies OwnedBlueprintsBadRequest, { status: 400 }),
    invalidBody: (error) =>
      Response.json(
        { error: 'invalid_request', issues: error.issues } satisfies OwnedBlueprintsBadRequest,
        { status: 400 },
      ),
  });
  if (!parsed.ok) return parsed.response;

  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ blueprints: [] } satisfies OwnedBlueprintsResponse);
  }

  const blueprintTypeIds = Array.from(new Set(parsed.data.blueprintTypeIds));
  const blueprints = await measureOwnedDataRead({
    endpoint: '/api/industry/owned-blueprints',
    requested: blueprintTypeIds.length,
    read: () => getOwnedBlueprintDetailOnView(userId, blueprintTypeIds),
    returned: (value) => value.length,
  });

  return Response.json({ blueprints } satisfies OwnedBlueprintsResponse);
}

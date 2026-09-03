import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { getOwnedBlueprintDetailOnView } from '@/composition/sync/owned-blueprints-sync';
import {
  ownedBlueprintsEndpoint,
  ownedBlueprintsRequestSchema,
} from '@/features/industry-planner/api-contract';
import { getCurrentUserId } from '@/composition/session';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

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
export const POST = capabilityRoute('planner.read-owned-blueprints', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
  const parsed = await readJsonBody(request, ownedBlueprintsRequestSchema);
  if (!parsed.ok) return apiResponse(ownedBlueprintsEndpoint, 400, parsed.failure);

  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse(ownedBlueprintsEndpoint, 200, { blueprints: [] });
  }

  const blueprintTypeIds = Array.from(new Set(parsed.data.blueprintTypeIds));
  const blueprints = await measureOwnedDataRead({
    endpoint: '/api/industry/owned-blueprints',
    requested: blueprintTypeIds.length,
    read: () => getOwnedBlueprintDetailOnView(userId, blueprintTypeIds),
    returned: (value) => value.length,
  });

  return apiResponse(ownedBlueprintsEndpoint, 200, { blueprints });
}

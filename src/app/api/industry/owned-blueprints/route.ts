import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { getOwnedBlueprintDetailOnView } from '@/composition/sync/owned-blueprints-sync';
import {
  ownedBlueprintsEndpoint,
  ownedBlueprintsRequestSchema,
} from '@/features/industry-planner/api-contract';
import { getCurrentUserId } from '@/platform/auth/session';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

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

import type { NextRequest } from 'next/server';
import { capabilityRoute } from '@/app/api/capability-route';
import { getOwnedAssetDetailOnView } from '@/composition/sync/owned-assets-sync';
import {
  ownedAssetsEndpoint,
  ownedAssetsRequestSchema,
} from '@/features/industry-planner/api-contract';
import { getCurrentUserId } from '@/platform/auth/session';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

// authz: auth
export const POST = capabilityRoute('planner.read-owned-assets', handlePost);

async function handlePost(request: NextRequest): Promise<Response> {
  const parsed = await readJsonBody(request, ownedAssetsRequestSchema);
  if (!parsed.ok) return apiResponse(ownedAssetsEndpoint, 400, parsed.failure);

  const userId = await getCurrentUserId();
  if (!userId) {
    return apiResponse(ownedAssetsEndpoint, 200, { assets: [] });
  }

  const typeIds = Array.from(new Set(parsed.data.typeIds));
  const assets = await measureOwnedDataRead({
    endpoint: '/api/industry/owned-assets',
    requested: typeIds.length,
    read: () => getOwnedAssetDetailOnView(userId, typeIds),
    returned: (value) => value.length,
  });

  return apiResponse(ownedAssetsEndpoint, 200, { assets });
}

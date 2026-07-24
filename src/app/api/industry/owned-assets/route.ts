import type { NextRequest } from 'next/server';
import { getOwnedAssetDetailOnView } from '@/composition/sync/owned-assets-sync';
import {
  ownedAssetsEndpoint,
  ownedAssetsRequestSchema,
} from '@/features/industry-planner/api-contract';
import { getCurrentUserId } from '@/platform/auth/session';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';
import { apiResponse } from '@/transport/api-response';
import { readJsonBody } from '@/transport/route-body';

/**
 * POST /api/industry/owned-assets
 * Body: \{ typeIds \} — the material/product types in the planned build whose owned
 * quantity the asset ledger needs (Owned / Remaining / held-by) and whose QTY ring
 * reflects owned-vs-needed. Scoped to the authenticated caller's own owners (the
 * user id comes from the session, never the body); an anonymous caller gets an
 * empty set, so every ring stays empty and every ledger shows '—' (the
 * byte-identical placeholder path). Returns only the OWNED types among those
 * requested — an un-held one is simply absent.
 */
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
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

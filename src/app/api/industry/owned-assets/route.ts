import type { NextRequest } from 'next/server';
import { getOwnedAssetDetailOnView } from '@/db/owned-assets-sync';
import {
  ownedAssetsRequestSchema,
  type OwnedAssetsBadRequest,
} from '@/features/industry-planner/api-contract';
import type { OwnedAssetsResponse } from '@/features/industry-planner/types';
import { getCurrentUserId } from '@/features/auth/session';
import { parseJsonBody } from '@/lib/route-body';
import { measureOwnedDataRead } from '@/app/api/owned-data-telemetry';

// POST /api/industry/owned-assets
// Body: { typeIds } — the material/product types in the planned build whose owned
// quantity the asset ledger needs (Owned / Remaining / held-by) and whose QTY ring
// reflects owned-vs-needed. Scoped to the authenticated caller's own owners (the
// user id comes from the session, never the body); an anonymous caller gets an
// empty set, so every ring stays empty and every ledger shows '—' (the
// byte-identical placeholder path). Returns only the OWNED types among those
// requested — an un-held one is simply absent.
// authz: auth
export async function POST(request: NextRequest): Promise<Response> {
  const parsed = await parseJsonBody(request, ownedAssetsRequestSchema, {
    invalidJson: () =>
      Response.json({ error: 'invalid_json' } satisfies OwnedAssetsBadRequest, { status: 400 }),
    invalidBody: (error) =>
      Response.json(
        { error: 'invalid_request', issues: error.issues } satisfies OwnedAssetsBadRequest,
        { status: 400 },
      ),
  });
  if (!parsed.ok) return parsed.response;

  const userId = await getCurrentUserId();
  if (!userId) {
    return Response.json({ assets: [] } satisfies OwnedAssetsResponse);
  }

  const typeIds = Array.from(new Set(parsed.data.typeIds));
  const assets = await measureOwnedDataRead({
    endpoint: '/api/industry/owned-assets',
    requested: typeIds.length,
    read: () => getOwnedAssetDetailOnView(userId, typeIds),
    returned: (value) => value.length,
  });

  return Response.json({ assets } satisfies OwnedAssetsResponse);
}

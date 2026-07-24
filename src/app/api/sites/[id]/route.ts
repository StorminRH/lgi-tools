import {
  siteDetailEndpoint,
  siteIdParamSchema,
} from '@/features/wormhole-sites/api-contract';
import { getPricedSiteDetail } from '@/features/wormhole-sites/queries';
import { notFoundFailure, validationFailure } from '@/lib/failure';
import { apiResponse } from '@/transport/api-response';

/**
 * Handles GET requests for /api/sites/[id]; this route owns its authorization, boundary
 * validation, and typed response mapping.
 */
// authz: public
// input: query
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = siteIdParamSchema.safeParse(await params);
  if (!parsed.success) {
    return apiResponse(
      siteDetailEndpoint,
      400,
      validationFailure('invalid_query', 'Invalid id'),
    );
  }

  const site = await getPricedSiteDetail(parsed.data.id);

  if (!site) {
    return apiResponse(
      siteDetailEndpoint,
      404,
      notFoundFailure('not_found', 'Not found'),
    );
  }

  return apiResponse(siteDetailEndpoint, 200, site);
}

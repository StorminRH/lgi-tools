import { siteDetailEndpoint } from '@/features/wormhole-sites/api-contract';
import { getPricedSiteDetail } from '@/features/wormhole-sites/queries';
import { notFoundFailure, validationFailure } from '@/lib/failure';
import { apiResponse } from '@/transport/api-response';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = siteDetailEndpoint.params.safeParse(await params);
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

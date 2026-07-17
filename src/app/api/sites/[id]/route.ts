import {
  type ApiError,
  siteIdParamSchema,
  type SiteDetail,
} from '@/features/wormhole-sites/api-contract';
import { getPricedSiteDetail } from '@/features/wormhole-sites/queries';

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
    return Response.json({ error: 'Invalid id' } satisfies ApiError, { status: 400 });
  }

  const site: SiteDetail | null = await getPricedSiteDetail(parsed.data.id);

  if (!site) {
    return Response.json({ error: 'Not found' } satisfies ApiError, { status: 404 });
  }

  return Response.json(site satisfies SiteDetail);
}

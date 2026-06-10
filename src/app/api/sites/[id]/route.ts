import { siteIdParamSchema } from '@/features/wormhole-sites/api-contract';
import { getPricedSiteDetail } from '@/features/wormhole-sites/queries';
import type { ApiError, SiteDetail } from '@/features/wormhole-sites/types';

// authz: public
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

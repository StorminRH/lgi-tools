import { getSiteDetail } from '@/features/wormhole-sites/queries';
import type { ApiError, SiteDetail } from '@/features/wormhole-sites/types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id: rawId } = await params;
  const id = parseInt(rawId, 10);

  if (isNaN(id)) {
    return Response.json({ error: 'Invalid id' } satisfies ApiError, { status: 400 });
  }

  const site: SiteDetail | null = await getSiteDetail(id);

  if (!site) {
    return Response.json({ error: 'Not found' } satisfies ApiError, { status: 404 });
  }

  return Response.json(site);
}

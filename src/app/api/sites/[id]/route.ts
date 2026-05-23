import { overlayLivePrices } from '@/features/wormhole-sites/live-prices';
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

  const raw: SiteDetail | null = await getSiteDetail(id);

  if (!raw) {
    return Response.json({ error: 'Not found' } satisfies ApiError, { status: 404 });
  }

  const [site] = await overlayLivePrices([raw]);
  return Response.json(site);
}

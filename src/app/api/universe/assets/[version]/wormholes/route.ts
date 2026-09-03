import {
  UNIVERSE_ASSET_CACHE_CONTROL,
  universeAssetVersionParamsSchema,
  wormholeCodexEndpoint,
} from '@/data/eve-data/api-contract';
import { getWormholeCodex } from '@/data/eve-data/universe-assets';
import { notFoundFailure } from '@/lib/failure';
import {
  apiResponse,
  withCacheControl,
} from '@/transport/api-response';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ version: string }> },
): Promise<Response> {
  const parsed = universeAssetVersionParamsSchema.safeParse(await params);
  const asset = await getWormholeCodex();
  if (!parsed.success || parsed.data.version !== asset.version) {
    return apiResponse(
      wormholeCodexEndpoint,
      404,
      notFoundFailure('asset_version_not_found'),
    );
  }
  return withCacheControl(
    apiResponse(wormholeCodexEndpoint, 200, asset),
    UNIVERSE_ASSET_CACHE_CONTROL,
  );
}

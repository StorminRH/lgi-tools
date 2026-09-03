import {
  adjacencyEndpoint,
  UNIVERSE_ASSET_CACHE_CONTROL,
  universeAssetVersionParamsSchema,
} from '@/data/eve-data/api-contract';
import { getAdjacencyGraph } from '@/data/eve-data/universe-assets';
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
  const asset = await getAdjacencyGraph();
  if (!parsed.success || parsed.data.version !== asset.version) {
    return apiResponse(
      adjacencyEndpoint,
      404,
      notFoundFailure('asset_version_not_found'),
    );
  }
  return withCacheControl(
    apiResponse(adjacencyEndpoint, 200, asset),
    UNIVERSE_ASSET_CACHE_CONTROL,
  );
}

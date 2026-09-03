import {
  systemDirectoryEndpoint,
  UNIVERSE_ASSET_CACHE_CONTROL,
  universeAssetVersionParamsSchema,
} from '@/data/eve-data/api-contract';
import { getSystemDirectory } from '@/data/eve-data/universe-assets';
import { notFoundFailure } from '@/lib/failure';
import {
  apiResponse,
  withCacheControl,
} from '@/transport/api-response';

// authz: public
// input: path
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ version: string }> },
): Promise<Response> {
  const parsed = universeAssetVersionParamsSchema.safeParse(await params);
  const asset = await getSystemDirectory();
  if (!parsed.success || parsed.data.version !== asset.version) {
    return apiResponse(
      systemDirectoryEndpoint,
      404,
      notFoundFailure('asset_version_not_found'),
    );
  }
  return withCacheControl(
    apiResponse(systemDirectoryEndpoint, 200, asset),
    UNIVERSE_ASSET_CACHE_CONTROL,
  );
}

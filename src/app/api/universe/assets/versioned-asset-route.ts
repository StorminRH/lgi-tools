import {
  UNIVERSE_ASSET_CACHE_CONTROL,
  type adjacencyEndpoint,
} from '@/data/eve-data/api-contract';
import { notFoundFailure } from '@/lib/failure';
import { apiResponse, withCacheControl } from '@/transport/api-response';
import type { EndpointContract, JsonCodec, ProblemCodec } from '@/transport/endpoint';

export type VersionedAssetEndpoint<TAsset extends { version: string }> = EndpointContract<null, {
  200: JsonCodec<TAsset>;
  404: ProblemCodec<'asset_version_not_found'>;
}> & { method: 'GET'; params: (typeof adjacencyEndpoint)['params'] };

/**
 * The GET handler for one versioned universe asset. A malformed version is a
 * 404 before the asset loads, a version other than the loaded asset's is a 404
 * too, and the current version is served with the immutable cache policy.
 */
export function versionedAssetRoute<TAsset extends { version: string }>(
  endpoint: VersionedAssetEndpoint<TAsset>,
  load: () => Promise<NoInfer<TAsset>>,
): (request: Request, context: { params: Promise<{ version: string }> }) => Promise<Response> {
  const notFound = () => apiResponse(endpoint, 404, notFoundFailure('asset_version_not_found'));
  return async (_request, { params }) => {
    const parsed = endpoint.params.safeParse(await params);
    if (!parsed.success) return notFound();
    const asset = await load();
    if (asset.version !== parsed.data.version) return notFound();
    return withCacheControl(apiResponse(endpoint, 200, asset), UNIVERSE_ASSET_CACHE_CONTROL);
  };
}

import { connection } from 'next/server';
import { universeAssetManifestEndpoint } from '@/data/eve-data/api-contract';
import { getCachedSdeVersion } from '@/data/eve-data/meta';
import { dependencyUnavailableFailure } from '@/lib/failure';
import {
  apiResponse,
  withCacheControl,
} from '@/transport/api-response';

/**
 * Returns the current SDE build identifier so clients can address the matching immutable assets.
 */
// authz: public
// input: none
export async function GET(): Promise<Response> {
  await connection();
  const { version } = await getCachedSdeVersion();
  if (version === null) {
    return withCacheControl(
      apiResponse(
        universeAssetManifestEndpoint,
        503,
        dependencyUnavailableFailure(
          'sde_unavailable',
          503,
          { detail: 'Universe assets are unavailable until the SDE is ingested.' },
        ),
      ),
      'no-store',
    );
  }
  return withCacheControl(
    apiResponse(universeAssetManifestEndpoint, 200, { version }),
    'no-store',
  );
}

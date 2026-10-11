import { versionedAssetRoute } from '@/app/api/universe/assets/versioned-asset-route';
import { systemDirectoryEndpoint } from '@/data/eve-data/api-contract';
import { getSystemDirectory } from '@/data/eve-data/universe-assets';

// authz: public
// input: path
export const GET = versionedAssetRoute(systemDirectoryEndpoint, getSystemDirectory);

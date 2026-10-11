import { versionedAssetRoute } from '@/app/api/universe/assets/versioned-asset-route';
import { wormholeCodexEndpoint } from '@/data/eve-data/api-contract';
import { getWormholeCodex } from '@/data/eve-data/universe-assets';

// authz: public
// input: path
export const GET = versionedAssetRoute(wormholeCodexEndpoint, getWormholeCodex);

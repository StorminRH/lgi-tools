import { versionedAssetRoute } from '@/app/api/universe/assets/versioned-asset-route';
import { adjacencyEndpoint } from '@/data/eve-data/api-contract';
import { getAdjacencyGraph } from '@/data/eve-data/universe-assets';

// authz: public
// input: path
export const GET = versionedAssetRoute(adjacencyEndpoint, getAdjacencyGraph);

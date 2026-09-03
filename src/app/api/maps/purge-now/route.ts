import { runMapLifecycleRoute } from '@/app/api/maps/lifecycle-route';
import { requestMapPurgeForUser } from '@/composition/map-lifecycle';
import { purgeMapNowEndpoint } from '@/data/maps/api-contract';

// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMapLifecycleRoute(request, {
    capability: 'maps.request-map-purge',
    endpoint: purgeMapNowEndpoint,
    run: requestMapPurgeForUser,
    forbidden: {
      code: 'map_creator_required',
      detail: 'Only the map creator can permanently delete this map',
    },
  });
}

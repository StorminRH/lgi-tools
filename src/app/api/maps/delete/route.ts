import { runMapLifecycleRoute } from '@/app/api/maps/lifecycle-route';
import { deleteMapForUser } from '@/composition/map-lifecycle';
import { deleteMapEndpoint } from '@/data/maps/api-contract';

// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMapLifecycleRoute(request, {
    capability: 'maps.delete-map',
    endpoint: deleteMapEndpoint,
    run: deleteMapForUser,
    forbidden: {
      code: 'map_admin_required',
      detail: 'Map admin access is required',
    },
  });
}

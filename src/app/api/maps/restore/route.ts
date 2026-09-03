import { runMapLifecycleRoute } from '@/app/api/maps/lifecycle-route';
import { restoreMapForUser } from '@/composition/map-lifecycle';
import { restoreMapEndpoint } from '@/data/maps/api-contract';

// authz: auth
export async function POST(request: Request): Promise<Response> {
  return runMapLifecycleRoute(request, {
    capability: 'maps.restore-map',
    endpoint: restoreMapEndpoint,
    run: restoreMapForUser,
    forbidden: {
      code: 'map_restore_unavailable',
      detail: 'This map can no longer be restored',
    },
  });
}

import './load-env';
import {
  projectMapAccess,
  teardownMapAccessProjection,
} from '@/composition/map-access-projection';
import { runScript } from './script-runtime';

const action = process.argv[2];
const mapId = process.argv[3];

if (action !== 'project' && action !== 'teardown') {
  console.error('Usage: project-map-access.ts <project|teardown> <mapId>');
  process.exit(1);
}
if (mapId === undefined || mapId.length === 0) {
  console.error('Usage: project-map-access.ts <project|teardown> <mapId>');
  process.exit(1);
}

runScript(async () => {
  const result =
    action === 'project' ? await projectMapAccess(mapId) : await teardownMapAccessProjection(mapId);
  console.log(JSON.stringify({ action, mapId, result }));
});

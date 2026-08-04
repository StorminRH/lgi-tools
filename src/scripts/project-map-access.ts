// Dev/tooling CLI: project or tear down one map's Convex access claims.
// Used by atlas authoring ux-check probes (revocation demo) and operators.
//
// Usage:
//   pnpm map:project-access -- project <mapId>
//   pnpm map:project-access -- teardown <mapId>
import { config } from 'dotenv';
import {
  projectMapAccess,
  teardownMapAccessProjection,
} from '@/composition/map-access-projection';
import { readEnv } from '@/lib/env';

config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

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

const run =
  action === 'project' ? projectMapAccess(mapId) : teardownMapAccessProjection(mapId);

run
  .then((result) => {
    console.log(JSON.stringify({ action, mapId, result }));
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });

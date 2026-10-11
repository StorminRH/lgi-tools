import './load-env';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readSystemStatics } from '@/data/wh-statics/queries';
import { resolveLockConnectionUrl } from '@/db';
import { createScriptClient, runScript } from './script-runtime';

const SPOT_CHECKS = [
  { name: 'J111613', systemId: 31_002_318, codes: ['E175'] },
  { name: 'J113551', systemId: 31_001_677, codes: ['C247', 'N766'] },
  { name: 'J112747', systemId: 31_001_361, codes: ['U210'] },
] as const;

const client = createScriptClient(resolveLockConnectionUrl(), { max: 1 });

async function main() {
  const promoted = await readSystemStatics(drizzle(client));
  const staticsBySystem = new Map(
    promoted.systems.map((system) => [system.systemId, system.codes]),
  );
  for (const spot of SPOT_CHECKS) {
    deepStrictEqual(
      staticsBySystem.get(spot.systemId),
      [...spot.codes],
      `${spot.name} does not match its expected promoted statics`,
    );
  }
  strictEqual(
    promoted.systems.length,
    2_604,
    'Promoted statics do not cover every known system',
  );
  console.log(
    JSON.stringify(
      {
        version: promoted.version,
        systemCount: promoted.systems.length,
        spotChecks: SPOT_CHECKS.map((spot) => ({
          system: spot.name,
          systemId: spot.systemId,
          codes: staticsBySystem.get(spot.systemId),
        })),
      },
      null,
      2,
    ),
  );
}

runScript(main, { client });

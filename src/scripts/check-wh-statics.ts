import { deepStrictEqual, strictEqual } from 'node:assert';
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { readSystemStatics } from '@/data/wh-statics/queries';
import {
  PG_CONNECT_TIMEOUT_SECONDS,
  resolveLockConnectionUrl,
} from '@/db';
import { readEnv } from '@/lib/env';
import { runScript } from './script-runtime';

config({ path: readEnv('DOTENV_PATH') ?? '.env.local' });

const SPOT_CHECKS = [
  { name: 'J111613', systemId: 31_002_318, codes: ['E175'] },
  { name: 'J113551', systemId: 31_001_677, codes: ['C247', 'N766'] },
  { name: 'J112747', systemId: 31_001_361, codes: ['U210'] },
] as const;

const client = postgres(resolveLockConnectionUrl(), {
  max: 1,
  connect_timeout: PG_CONNECT_TIMEOUT_SECONDS,
});

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

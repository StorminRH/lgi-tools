import postgres from 'postgres';
import { readEnv } from '@/lib/env';
import { PG_CONNECT_TIMEOUT_SECONDS, resolveLockConnectionUrl, type Sql } from '@/db';

export function requireSoftFailLockClient(
  missingDatabaseMessage: string,
  lockFailurePrefix: string,
): Sql {
  if (!readEnv('DATABASE_URL') && !readEnv('DATABASE_URL_UNPOOLED')) {
    console.log(missingDatabaseMessage);
    process.exit(0);
  }
  try {
    return postgres(resolveLockConnectionUrl(), {
      max: 2,
      connect_timeout: PG_CONNECT_TIMEOUT_SECONDS,
    });
  } catch (err) {
    console.error(lockFailurePrefix, err);
    process.exit(0);
  }
}

export function runScript(
  main: () => Promise<void>,
  options: { client: Sql; softFail?: boolean },
): void {
  main()
    .then(async () => {
      await options.client.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await options.client.end().catch(() => undefined);

      process.exit(options.softFail ? 0 : 1);
    });
}

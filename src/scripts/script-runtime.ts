import postgres from 'postgres';
import { readEnv } from '@/lib/env';
import { PG_CONNECT_TIMEOUT_SECONDS, resolveLockConnectionUrl, type Sql } from '@/db';

/** The one postgres-js client factory for CLI entries: each script picks its URL and pool size, the establishment bound is stated here. */
export function createScriptClient(url: string, options: { max: number }): Sql {
  return postgres(url, { max: options.max, connect_timeout: PG_CONNECT_TIMEOUT_SECONDS });
}

export function requireSoftFailLockClient(
  missingDatabaseMessage: string,
  lockFailurePrefix: string,
): Sql {
  if (!readEnv('DATABASE_URL') && !readEnv('DATABASE_URL_UNPOOLED')) {
    console.log(missingDatabaseMessage);
    process.exit(0);
  }
  try {
    return createScriptClient(resolveLockConnectionUrl(), { max: 2 });
  } catch (err) {
    console.error(lockFailurePrefix, err);
    process.exit(0);
  }
}

export function runScript(
  main: () => Promise<void>,
  options: { client?: Sql; softFail?: boolean } = {},
): void {
  main()
    .then(async () => {
      await options.client?.end();
      process.exit(0);
    })
    .catch(async (err: unknown) => {
      console.error(err);
      await options.client?.end().catch(() => undefined);
      process.exit(options.softFail ? 0 : 1);
    });
}

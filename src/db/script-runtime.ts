// Shared teardown for the db entry scripts: run main(), close the client, exit.
// Two variants — HARD-fail (exit 1 on error: the manual/CLI tools) and
// SOFT-fail (log + exit 0: the deploy-time bootstraps, where a failed ingest
// must not fail the build). One implementation so the close-then-exit ordering
// can't drift between scripts. The script's testable logic lives in
// import-safe sibling modules; this keeps the entry file a thin boot + call.
import type postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

/**
 * Runs a database maintenance script with standardized success and failure reporting, closing the
 * database connection before returning an exit code.
 */
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
      // Soft failure (deploy bootstraps): the build continues. Hard failure
      // (manual tools): surface a non-zero exit.
      process.exit(options.softFail ? 0 : 1);
    });
}

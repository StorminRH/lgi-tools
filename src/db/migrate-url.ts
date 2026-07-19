/**
 * Chooses the connection string for schema migrations (DDL). Prefers
 * DATABASE_MIGRATION_URL — the schema-owner role — and treats unset or empty
 * as missing, falling back to DATABASE_URL so local/dev and single-role
 * environments behave exactly as before the role split. The request path
 * (src/db/index.ts) must keep DATABASE_URL on the least-privilege runtime
 * role; this is the only sanctioned owner-credential read in src/.
 */
export function resolveMigrationUrl(
  env: Record<string, string | undefined> = process.env,
): string {
  const migrationUrl = env.DATABASE_MIGRATION_URL?.trim();
  if (migrationUrl) return migrationUrl;
  const fallback = env.DATABASE_URL?.trim();
  if (fallback) return fallback;
  throw new Error(
    'No migration connection string: set DATABASE_MIGRATION_URL (schema-owner ' +
      'role) or DATABASE_URL.',
  );
}

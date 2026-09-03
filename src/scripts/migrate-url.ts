export function resolveMigrationUrl(env: Record<string, string | undefined>): string {
  const migrationUrl = env.DATABASE_MIGRATION_URL?.trim();
  if (migrationUrl) return migrationUrl;
  const fallback = env.DATABASE_URL?.trim();
  if (fallback) return fallback;
  throw new Error(
    'No migration connection string: set DATABASE_MIGRATION_URL (schema-owner ' +
      'role) or DATABASE_URL.',
  );
}

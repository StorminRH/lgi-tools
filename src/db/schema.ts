// Feature tables live alongside their feature in `src/features/<name>/schema.ts`
// and are re-exported from here so drizzle-kit sees them all in one place.
// Per CLAUDE.md: schema stays extensible; features add their own tables.

export * from '../features/wormhole-sites/schema';

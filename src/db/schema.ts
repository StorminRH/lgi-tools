// Feature tables live alongside their feature in `src/features/<name>/schema.ts`
// and are re-exported from here so drizzle-kit sees them all in one place.
// Schema stays extensible; features add their own tables.

export * from '../features/wormhole-sites/schema';
export * from '../data/eve-data/schema';
export * from '../data/market-prices/schema';
export * from '../data/market-history/schema';
export * from '../data/industry-indices/schema';
export * from '../features/auth/schema';
export * from '../features/owned-blueprints/schema';
export * from '../features/owned-assets/schema';
export * from '../features/owned-structures/schema';
export * from '../features/skill-queue/schema';
export * from '../features/industry-jobs/schema';
export * from '../data/telemetry/schema';
export * from '../data/gsc/schema';
export * from '../data/preferences/schema';

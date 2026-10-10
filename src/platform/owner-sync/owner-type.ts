/**
 * The ESI owner vocabulary: who holds an ESI-synced row. Each owner-keyed table
 * keeps its own pgEnum name but takes its values from here. A leaf with no
 * imports, so schemas and client contracts import it without the engine.
 * Map access grantees (data/maps MAP_ACCESS_OWNER_TYPES) are a separate concept.
 */
export const ESI_OWNER_TYPES = ['character', 'corporation'] as const;
export type EsiOwnerType = (typeof ESI_OWNER_TYPES)[number];

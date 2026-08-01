// The pure map role and capability vocabulary. It is the single owner shared by the durable Neon
// access rule, the Postgres enum, and the collaborative gate in convex/, so neither runtime can
// drift from the other's idea of what a role may do. It holds no database, framework, or slice
// import; behaviour lives in ./access.ts and in the Convex gate that consumes this record.

/** Persisted map roles; this tuple is the single TypeScript and Postgres vocabulary. */
export const MAP_ROLES = ['viewer', 'editor', 'owner'] as const;

/** One persisted map role. */
export type MapRole = (typeof MAP_ROLES)[number];

/** The capabilities one role may carry on one map. */
export const MAP_CAPABILITIES = ['view', 'edit'] as const;

/** One map capability a caller may be required to hold. */
export type MapCapability = (typeof MAP_CAPABILITIES)[number];

/** The capability flags carried by a single role. */
export interface MapRoleCapabilities {
  readonly canView: boolean;
  readonly canEdit: boolean;
}

/** Explicit capabilities for every persisted role; capabilities never derive from role order. */
export const MAP_ROLE_CAPABILITIES: Readonly<Record<MapRole, MapRoleCapabilities>> = {
  viewer: { canView: true, canEdit: false },
  editor: { canView: true, canEdit: true },
  owner: { canView: true, canEdit: true },
};

/**
 * Precedence selects the reported role when several grants match, and gives the projected role set a
 * deterministic serialization order. It does not grant capabilities; those are unioned independently
 * through {@link MAP_ROLE_CAPABILITIES}.
 */
export const MAP_ROLE_PRECEDENCE: readonly MapRole[] = ['owner', 'editor', 'viewer'];

/**
 * Deduplicates and orders roles by {@link MAP_ROLE_PRECEDENCE}, appending any
 * unranked values after. Shared by Neon resolution and the Convex claim writer
 * so equal sets serialize identically in both runtimes.
 */
export function canonicalizeMapRoles(roles: readonly MapRole[]): MapRole[] {
  const unique = new Set(roles);
  const ranked = MAP_ROLE_PRECEDENCE.filter((role) => unique.has(role));
  const unranked = [...unique].filter((role) => !MAP_ROLE_PRECEDENCE.includes(role));
  return [...ranked, ...unranked];
}

// Which capability flag answers which capability. `satisfies` makes this total: adding a value to
// MAP_CAPABILITIES without adding its flag here is a compile error, so a new capability can never
// fall through to an unrelated flag and silently grant itself.
const CAPABILITY_FLAGS = {
  view: 'canView',
  edit: 'canEdit',
} as const satisfies Record<MapCapability, keyof MapRoleCapabilities>;

/**
 * Whether one role carries one capability. The capability record is read at call time so a role
 * added to it — including a later non-linear role — is honoured without any ordinal comparison, and
 * a role absent from the record is denied rather than assumed.
 */
export function roleAllows(role: MapRole, capability: MapCapability): boolean {
  const capabilities = MAP_ROLE_CAPABILITIES[role] as MapRoleCapabilities | undefined;
  if (capabilities === undefined) return false;
  return capabilities[CAPABILITY_FLAGS[capability]];
}

/**
 * Whether any role in an effective set carries one capability. This is the union rule both runtimes
 * apply: a caller holding several roles keeps every capability any one of them grants.
 */
export function rolesAllow(
  roles: readonly MapRole[],
  capability: MapCapability,
): boolean {
  return roles.some((role) => roleAllows(role, capability));
}

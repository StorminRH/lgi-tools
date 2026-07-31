/** Pure shared map-role vocabulary and capability predicates for Neon and Convex. */

/** Persisted map roles; this tuple is the single TypeScript and Postgres vocabulary. */
export const MAP_ROLES = ['viewer', 'editor', 'owner'] as const;
/** One persisted map role. */
export type MapRole = (typeof MAP_ROLES)[number];

/** Capability literals the collaborative gate accepts. */
export type MapCapability = 'view' | 'edit';

/** Explicit capabilities for every persisted role; capabilities never derive from role order. */
export const MAP_ROLE_CAPABILITIES: Readonly<
  Record<MapRole, Readonly<{ canView: boolean; canEdit: boolean }>>
> = {
  viewer: { canView: true, canEdit: false },
  editor: { canView: true, canEdit: true },
  owner: { canView: true, canEdit: true },
};

/**
 * Precedence selects the reported role when several grants match. It does not grant capabilities;
 * those are unioned independently through `MAP_ROLE_CAPABILITIES`.
 */
export const MAP_ROLE_PRECEDENCE: readonly MapRole[] = ['owner', 'editor', 'viewer'];

/** True when one role carries the named capability through the shared record. */
export function roleAllows(role: MapRole, capability: MapCapability): boolean {
  const capabilities = MAP_ROLE_CAPABILITIES[role];
  return capability === 'view' ? capabilities.canView : capabilities.canEdit;
}

/** True when any role in the projected set carries the named capability. */
export function rolesAllow(
  roles: readonly MapRole[],
  capability: MapCapability,
): boolean {
  return roles.some((role) => roleAllows(role, capability));
}

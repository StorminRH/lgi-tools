/** Persisted map roles shared by durable and collaborative access checks. */
export const MAP_ROLES = ['viewer', 'editor', 'owner'] as const;

/** One persisted map role. */
export type MapRole = (typeof MAP_ROLES)[number];

/** One map capability checked at an authorization boundary. */
export type MapCapability = 'view' | 'edit';

/**
 * Precedence selects deterministic serialization and display only. It never
 * determines whether a capability is granted.
 */
export const MAP_ROLE_PRECEDENCE: readonly MapRole[] = [
  'owner',
  'editor',
  'viewer',
];

/** Explicit capabilities for every persisted role. */
export const MAP_ROLE_CAPABILITIES: Readonly<
  Record<MapRole, Readonly<{ canView: boolean; canEdit: boolean }>>
> = {
  viewer: { canView: true, canEdit: false },
  editor: { canView: true, canEdit: true },
  owner: { canView: true, canEdit: true },
};

/** Returns whether one role grants the requested map capability. */
export function roleAllows(
  role: MapRole,
  capability: MapCapability,
): boolean {
  const grants = MAP_ROLE_CAPABILITIES[role];
  return capability === 'view' ? grants.canView : grants.canEdit;
}

/** Returns whether any effective role grants the requested map capability. */
export function rolesAllow(
  roles: readonly MapRole[],
  capability: MapCapability,
): boolean {
  return roles.some((role) => roleAllows(role, capability));
}

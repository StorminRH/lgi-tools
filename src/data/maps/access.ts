import {
  MAP_ROLE_CAPABILITIES,
  MAP_ROLE_PRECEDENCE,
  rolesAllow,
  type MapRoleCapabilities,
} from './access-contract';
import type { MapAccessOwnerType, MapRole } from './schema';

// The role/capability vocabulary is re-exported from its pure ./access-contract owner so existing
// callers keep resolving these exact values while the Convex gate shares the same record.
export { MAP_ROLE_CAPABILITIES, MAP_ROLE_PRECEDENCE };

/** The EVE character and corporation principals through which one user may hold a grant. */
export interface MapPrincipals {
  readonly characterIds: readonly number[];
  readonly corporationIds: readonly number[];
}

/** One stored delegated map grant shaped for the pure access rule. */
export interface MapGrant {
  readonly ownerType: MapAccessOwnerType;
  readonly ownerId: number;
  readonly role: MapRole;
}

/** The authoritative role and current map capabilities returned to callers. */
export interface MapAccess extends MapRoleCapabilities {
  readonly role: MapRole | null;
}

const NO_ACCESS: MapAccess = { role: null, canView: false, canEdit: false };

function principalMatches(grant: MapGrant, principals: MapPrincipals): boolean {
  const ids =
    grant.ownerType === 'character'
      ? principals.characterIds
      : principals.corporationIds;
  return ids.includes(grant.ownerId);
}

/** The inputs that decide one user's effective roles on one map. */
export interface MapRoleInput {
  readonly isCreator: boolean;
  readonly grants: readonly MapGrant[];
  readonly principals: MapPrincipals;
}

/**
 * Resolves the complete, de-duplicated set of roles one user holds on one map, ordered by
 * `MAP_ROLE_PRECEDENCE` so equal sets serialize identically. This is the capability-preserving
 * projection: it keeps every matched role rather than collapsing to a display role, so a caller
 * matching through several principals cannot silently lose a capability. Map creation is
 * authoritative on its own and resolves to `owner` without consulting delegated grants.
 */
export function resolveMatchedMapRoles(input: MapRoleInput): readonly MapRole[] {
  if (input.isCreator) return ['owner'];

  const matchedRoles = new Set<MapRole>();
  for (const grant of input.grants) {
    if (principalMatches(grant, input.principals)) matchedRoles.add(grant.role);
  }

  const ranked = MAP_ROLE_PRECEDENCE.filter((role) => matchedRoles.has(role));
  const unranked = [...matchedRoles].filter(
    (role) => !MAP_ROLE_PRECEDENCE.includes(role),
  );
  return [...ranked, ...unranked];
}

/**
 * Decides one user's role and capabilities for one map from its grant rows and that user's
 * resolved principals. This is the version's single access rule: capabilities come from the
 * capability record, never from role ordering, so later non-linear roles remain representable.
 */
export function resolveMapRole(input: MapRoleInput): MapAccess {
  const roles = resolveMatchedMapRoles(input);
  if (roles.length === 0) return { ...NO_ACCESS };

  return {
    role: MAP_ROLE_PRECEDENCE.find((role) => roles.includes(role)) ?? null,
    canView: rolesAllow(roles, 'view'),
    canEdit: rolesAllow(roles, 'edit'),
  };
}

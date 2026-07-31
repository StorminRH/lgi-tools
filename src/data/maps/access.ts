import {
  MAP_ROLE_PRECEDENCE,
  rolesAllow,
  type MapRole,
} from './access-contract';
import type { MapAccessOwnerType } from './schema';

export {
  MAP_ROLE_CAPABILITIES,
  MAP_ROLE_PRECEDENCE,
  type MapCapability,
  type MapRole,
} from './access-contract';

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
export interface MapAccess {
  readonly role: MapRole | null;
  readonly canView: boolean;
  readonly canEdit: boolean;
}

const NO_ACCESS: MapAccess = { role: null, canView: false, canEdit: false };

function principalMatches(grant: MapGrant, principals: MapPrincipals): boolean {
  const ids =
    grant.ownerType === 'character'
      ? principals.characterIds
      : principals.corporationIds;
  return ids.includes(grant.ownerId);
}

/**
 * Resolves the precedence-sorted, de-duplicated effective role set for one map
 * principal/grant input. Capability grants union through this set; display role
 * selection still uses precedence only for serialization.
 */
export function resolveMatchedMapRoles(input: {
  readonly isCreator: boolean;
  readonly grants: readonly MapGrant[];
  readonly principals: MapPrincipals;
}): MapRole[] {
  if (input.isCreator) return ['owner'];

  const matchedRoles = new Set<MapRole>();
  for (const grant of input.grants) {
    if (principalMatches(grant, input.principals)) matchedRoles.add(grant.role);
  }
  return MAP_ROLE_PRECEDENCE.filter((role) => matchedRoles.has(role));
}

/**
 * Decides one user's role and capabilities for one map from its grant rows and that user's
 * resolved principals. This is the version's single access rule: capabilities come from the
 * capability record, never from role ordering, so later non-linear roles remain representable.
 */
export function resolveMapRole(input: {
  readonly isCreator: boolean;
  readonly grants: readonly MapGrant[];
  readonly principals: MapPrincipals;
}): MapAccess {
  const roles = resolveMatchedMapRoles(input);
  if (roles.length === 0) return { ...NO_ACCESS };

  return {
    role: roles[0] ?? null,
    canView: rolesAllow(roles, 'view'),
    canEdit: rolesAllow(roles, 'edit'),
  };
}

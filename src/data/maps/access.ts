import {
  canonicalizeMapRoles,
  MAP_ROLE_CAPABILITIES,
  MAP_ROLE_PRECEDENCE,
  rolesAllow,
  type MapRoleCapabilities,
} from './access-contract';
import type { MapAccessOwnerType, MapRole } from './schema';

export { MAP_ROLE_CAPABILITIES, MAP_ROLE_PRECEDENCE };

export interface MapPrincipals {
  readonly characterIds: readonly number[];
  readonly corporationIds: readonly number[];
}

export interface MapGrant {
  readonly ownerType: MapAccessOwnerType;
  readonly ownerId: number;
  readonly role: MapRole;
}

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

export interface MapRoleInput {
  readonly isCreator: boolean;
  readonly grants: readonly MapGrant[];
  readonly principals: MapPrincipals;
}

export function resolveMatchedMapRoles(input: MapRoleInput): readonly MapRole[] {
  if (input.isCreator) return ['admin'];

  const matchedRoles = new Set<MapRole>();
  for (const grant of input.grants) {
    if (principalMatches(grant, input.principals)) matchedRoles.add(grant.role);
  }

  return canonicalizeMapRoles([...matchedRoles]);
}

export function resolveMapRole(input: MapRoleInput): MapAccess {
  const roles = resolveMatchedMapRoles(input);
  if (roles.length === 0) return { ...NO_ACCESS };

  return {
    role: MAP_ROLE_PRECEDENCE.find((role) => roles.includes(role)) ?? roles[0]!,
    canView: rolesAllow(roles, 'view'),
    canEdit: rolesAllow(roles, 'edit'),
  };
}

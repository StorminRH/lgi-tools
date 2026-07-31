import {
  MAP_ROLE_CAPABILITIES,
  MAP_ROLE_PRECEDENCE,
  type MapRole,
} from './access-contract';
import type { MapAccessOwnerType } from './schema';

export {
  MAP_ROLE_CAPABILITIES,
  MAP_ROLE_PRECEDENCE,
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
 * Decides one user's role and capabilities for one map from its grant rows and that user's
 * resolved principals. This is the version's single access rule: capabilities come from the
 * capability record, never from role ordering, so later non-linear roles remain representable.
 */
export function resolveMapRole(input: {
  readonly isCreator: boolean;
  readonly grants: readonly MapGrant[];
  readonly principals: MapPrincipals;
}): MapAccess {
  const matchedRoles = resolveMatchedMapRoles(input);
  if (matchedRoles.length === 0) return { ...NO_ACCESS };

  let canView = false;
  let canEdit = false;
  for (const role of matchedRoles) {
    const capabilities = MAP_ROLE_CAPABILITIES[role];
    canView ||= capabilities.canView;
    canEdit ||= capabilities.canEdit;
  }

  return {
    role: matchedRoles[0] ?? null,
    canView,
    canEdit,
  };
}

/**
 * Resolves the complete effective role set for durable projection, sorted by
 * display precedence and de-duplicated without deriving capabilities from rank.
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

import type { MapAccessOwnerType, MapRole } from './schema';

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

/** Explicit capabilities for every persisted role; capabilities never derive from role order. */
export const MAP_ROLE_CAPABILITIES: Readonly<
  Record<MapRole, Readonly<Omit<MapAccess, 'role'>>>
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
  if (input.isCreator) {
    return { role: 'owner', ...MAP_ROLE_CAPABILITIES.owner };
  }

  const matchedRoles = new Set<MapRole>();
  for (const grant of input.grants) {
    if (principalMatches(grant, input.principals)) matchedRoles.add(grant.role);
  }
  if (matchedRoles.size === 0) return { ...NO_ACCESS };

  let canView = false;
  let canEdit = false;
  for (const role of matchedRoles) {
    const capabilities = MAP_ROLE_CAPABILITIES[role];
    canView ||= capabilities.canView;
    canEdit ||= capabilities.canEdit;
  }

  return {
    role: MAP_ROLE_PRECEDENCE.find((role) => matchedRoles.has(role)) ?? null,
    canView,
    canEdit,
  };
}

import {
  canonicalizeMapRoles,
  MAP_ROLE_PRECEDENCE,
  rolesAllow,
  type MapAccessOwnerType,
  type MapRole,
  type MapRoleCapabilities,
} from './access-contract';

export interface MapPrincipals {
  readonly characterIds: readonly number[];
  readonly corporationIds: readonly number[];
}

export interface MapGrant {
  readonly ownerType: MapAccessOwnerType;
  readonly ownerId: number;
  readonly role: MapRole;
}

export interface DatedMapGrant extends MapGrant {
  readonly grantedAt: Date;
}

export interface CharacterAffiliation {
  readonly characterId: number;
  readonly corporationId: number | null;
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

function grantMatchesCharacter(grant: MapGrant, character: CharacterAffiliation): boolean {
  return grant.ownerType === 'character'
    ? grant.ownerId === character.characterId
    : grant.ownerId === character.corporationId;
}

function earliestMatchingGrantAt(
  grants: readonly DatedMapGrant[],
  character: CharacterAffiliation,
): number | null {
  let earliest: number | null = null;
  for (const grant of grants) {
    if (!grantMatchesCharacter(grant, character)) continue;
    const at = grant.grantedAt.getTime();
    if (earliest === null || at < earliest) earliest = at;
  }
  return earliest;
}

/**
 * Characters that match a grant themselves, ordered by the earliest matching
 * grant and then by id. The first entry names the user on map edits when
 * nothing of theirs is tracked yet.
 */
export function orderEligibleCharacters(
  grants: readonly DatedMapGrant[],
  characters: readonly CharacterAffiliation[],
): number[] {
  const ranked: Array<{ characterId: number; at: number }> = [];
  for (const character of characters) {
    const at = earliestMatchingGrantAt(grants, character);
    if (at !== null) ranked.push({ characterId: character.characterId, at });
  }
  ranked.sort((left, right) => left.at - right.at || left.characterId - right.characterId);
  return ranked.map((entry) => entry.characterId);
}

export type MapBlockRefusal = 'self' | 'owner';

/** Nobody blocks their own character, and the map creator's characters are never blocked. */
export function mapBlockRefusal(input: {
  readonly callerUserId: string;
  readonly creatorUserId: string;
  readonly holderUserId: string | null;
}): MapBlockRefusal | null {
  if (input.holderUserId === null) return null;
  if (input.holderUserId === input.callerUserId) return 'self';
  return input.holderUserId === input.creatorUserId ? 'owner' : null;
}

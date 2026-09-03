export const MAP_ROLES = ['viewer', 'editor', 'admin'] as const;

export type MapRole = (typeof MAP_ROLES)[number];

export const MAP_ACCESS_OWNER_TYPES = ['character', 'corporation'] as const;
export type MapAccessOwnerType = (typeof MAP_ACCESS_OWNER_TYPES)[number];

export interface CorporationAccessOption {
  readonly corporationId: number;
  readonly name: string;
  readonly logoUrl?: string;
}

export interface MapAccessGrantOption {
  readonly ownerType: MapAccessOwnerType;
  readonly ownerId: number;
  readonly role: MapRole;
  readonly name: string;
}

export type MapCapability = 'view' | 'edit';

export interface MapRoleCapabilities {
  readonly canView: boolean;
  readonly canEdit: boolean;
}

export const MAP_ROLE_CAPABILITIES: Readonly<Record<MapRole, MapRoleCapabilities>> = {
  viewer: { canView: true, canEdit: false },
  editor: { canView: true, canEdit: true },
  admin: { canView: true, canEdit: true },
};

export const MAP_ROLE_PRECEDENCE: readonly MapRole[] = ['admin', 'editor', 'viewer'];

export function canonicalizeMapRoles(roles: readonly MapRole[]): MapRole[] {
  const unique = new Set(roles);
  const ranked = MAP_ROLE_PRECEDENCE.filter((role) => unique.has(role));
  const unranked = [...unique].filter((role) => !MAP_ROLE_PRECEDENCE.includes(role));
  return [...ranked, ...unranked];
}

const CAPABILITY_FLAGS = {
  view: 'canView',
  edit: 'canEdit',
} as const satisfies Record<MapCapability, keyof MapRoleCapabilities>;

export function roleAllows(role: MapRole, capability: MapCapability): boolean {
  const capabilities = MAP_ROLE_CAPABILITIES[role] as MapRoleCapabilities | undefined;
  if (capabilities === undefined) return false;
  return capabilities[CAPABILITY_FLAGS[capability]];
}

export function rolesAllow(
  roles: readonly MapRole[],
  capability: MapCapability,
): boolean {
  return roles.some((role) => roleAllows(role, capability));
}

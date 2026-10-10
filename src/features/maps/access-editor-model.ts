import type { CreateMapRequest } from '@/data/maps/api-contract';
import {
  isMapCreateRole,
  MAP_CREATE_ROLES,
  MAP_ROLES,
  type CorporationAccessOption,
  type MapAccessOwnerType,
  type MapRole,
} from '@/data/maps/access-contract';

export type AccessEditorMode = 'create' | 'manage';

export interface AccessPrincipalOption {
  readonly ownerType: MapAccessOwnerType;
  readonly ownerId: number;
  readonly name: string;
  readonly imageUrl?: string;
}

export interface AccessGrantDraft extends AccessPrincipalOption {
  readonly role: MapRole | null;
}

const MAP_ROLE_LABELS: Readonly<Record<MapRole, string>> = {
  viewer: 'Read-only',
  editor: 'Write',
  admin: 'Admin',
};

export function mapRoleLabel(role: MapRole): string {
  return MAP_ROLE_LABELS[role];
}

export function accessRolesForMode(mode: AccessEditorMode): readonly MapRole[] {
  return mode === 'create' ? MAP_CREATE_ROLES : MAP_ROLES;
}

export function accessPrincipalKey(
  principal: Pick<AccessPrincipalOption, 'ownerType' | 'ownerId'>,
): string {
  return `${principal.ownerType}:${principal.ownerId}`;
}

export function corporationAccessPrincipal(
  corporation: CorporationAccessOption,
): AccessPrincipalOption {
  return {
    ownerType: 'corporation',
    ownerId: corporation.corporationId,
    name: corporation.name,
    imageUrl: corporation.logoUrl,
  };
}

export function initialCreationAccessDrafts(
  corporations: readonly CorporationAccessOption[],
): AccessGrantDraft[] {
  if (corporations.length !== 1) return [];
  const corporation = corporations[0];
  return corporation === undefined
    ? []
    : [{ ...corporationAccessPrincipal(corporation), role: null }];
}

export function addAccessPrincipal(
  drafts: readonly AccessGrantDraft[],
  principal: AccessPrincipalOption,
): AccessGrantDraft[] {
  const key = accessPrincipalKey(principal);
  return drafts.some((draft) => accessPrincipalKey(draft) === key)
    ? [...drafts]
    : [...drafts, { ...principal, role: null }];
}

export function removeAccessPrincipal(
  drafts: readonly AccessGrantDraft[],
  principal: Pick<AccessPrincipalOption, 'ownerType' | 'ownerId'>,
): AccessGrantDraft[] {
  const key = accessPrincipalKey(principal);
  return drafts.filter((draft) => accessPrincipalKey(draft) !== key);
}

export function setAccessDraftRole(
  mode: AccessEditorMode,
  drafts: readonly AccessGrantDraft[],
  principal: Pick<AccessPrincipalOption, 'ownerType' | 'ownerId'>,
  role: MapRole,
): AccessGrantDraft[] {
  if (!accessRolesForMode(mode).includes(role)) return [...drafts];
  const key = accessPrincipalKey(principal);
  return drafts.map((draft) =>
    accessPrincipalKey(draft) === key ? { ...draft, role } : draft,
  );
}

export function createMapGrantsFromDrafts(
  drafts: readonly AccessGrantDraft[],
): CreateMapRequest['grants'] | null {
  const grants: CreateMapRequest['grants'] = [];
  for (const draft of drafts) {
    if (!isMapCreateRole(draft.role)) return null;
    grants.push({ ownerType: draft.ownerType, ownerId: draft.ownerId, role: draft.role });
  }
  return grants;
}

export type PreparedMapCreation =
  | { readonly ok: true; readonly input: CreateMapRequest }
  | { readonly ok: false; readonly message: string };

/** Character ids holding a saved grant on the list. */
export function grantedCharacterIds(drafts: readonly AccessGrantDraft[]): ReadonlySet<number> {
  return new Set(drafts
    .filter((draft) => draft.ownerType === 'character' && draft.role !== null)
    .map((draft) => draft.ownerId));
}

export const CREATOR_CHARACTER_REQUIRED_MESSAGE = 'Choose at least one of your characters.';

export function prepareMapCreation(
  name: string,
  creatorCharacterIds: readonly number[],
  drafts: readonly AccessGrantDraft[],
  maxNameLength: number,
): PreparedMapCreation {
  const normalizedName = name.trim();
  if (normalizedName.length === 0 || normalizedName.length > maxNameLength) {
    return {
      ok: false,
      message: `Enter a map name up to ${maxNameLength} characters.`,
    };
  }
  if (creatorCharacterIds.length === 0) {
    return { ok: false, message: CREATOR_CHARACTER_REQUIRED_MESSAGE };
  }
  const own = new Set(creatorCharacterIds);
  const grants = createMapGrantsFromDrafts(
    drafts.filter((draft) => draft.ownerType !== 'character' || !own.has(draft.ownerId)),
  );
  if (grants === null) {
    return {
      ok: false,
      message: 'Choose Read-only or Write for every selected principal.',
    };
  }
  return {
    ok: true,
    input: { name: normalizedName, creatorCharacterIds: [...creatorCharacterIds], grants },
  };
}

export function characterSearchPopupOpen(
  requestedOpen: boolean,
  availableResultCount: number,
): boolean {
  return requestedOpen && availableResultCount > 0;
}

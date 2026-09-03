import type { CreateMapRequest } from '@/data/maps/api-contract';
import type {
  CorporationAccessOption,
  MapAccessOwnerType,
  MapRole,
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

const CREATE_ROLES = ['viewer', 'editor'] as const;
const MANAGE_ROLES = ['viewer', 'editor', 'admin'] as const;
const MAP_ROLE_LABELS: Readonly<Record<MapRole, string>> = {
  viewer: 'Read-only',
  editor: 'Write',
  admin: 'Admin',
};

export function mapRoleLabel(role: MapRole): string {
  return MAP_ROLE_LABELS[role];
}

export function accessRolesForMode(mode: AccessEditorMode): readonly MapRole[] {
  return mode === 'create' ? CREATE_ROLES : MANAGE_ROLES;
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

export function accessDraftsComplete(
  mode: AccessEditorMode,
  drafts: readonly AccessGrantDraft[],
): boolean {
  const roles = accessRolesForMode(mode);
  return drafts.every((draft) => draft.role !== null && roles.includes(draft.role));
}

export function createMapGrantsFromDrafts(
  drafts: readonly AccessGrantDraft[],
): CreateMapRequest['grants'] | null {
  if (!accessDraftsComplete('create', drafts)) return null;
  return drafts.map((draft) => {

    const role = draft.role as 'viewer' | 'editor';
    return {
      ownerType: draft.ownerType,
      ownerId: draft.ownerId,
      role,
    };
  });
}

export type PreparedMapCreation =
  | { readonly ok: true; readonly input: CreateMapRequest }
  | { readonly ok: false; readonly message: string };

export function prepareMapCreation(
  name: string,
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
  const grants = createMapGrantsFromDrafts(drafts);
  if (grants === null) {
    return {
      ok: false,
      message: 'Choose Read-only or Write for every selected principal.',
    };
  }
  return { ok: true, input: { name: normalizedName, grants } };
}

export function characterSearchPopupOpen(
  requestedOpen: boolean,
  availableResultCount: number,
): boolean {
  return requestedOpen && availableResultCount > 0;
}

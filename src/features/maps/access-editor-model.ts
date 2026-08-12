import type { CreateMapRequest } from '@/data/maps/api-contract';
import type {
  CorporationAccessOption,
  MapAccessOwnerType,
  MapRole,
} from '@/data/maps/access-contract';

/** Whether the shared access editor is drafting creation grants or live map grants. */
export type AccessEditorMode = 'create' | 'manage';

/** One presentation-ready character or corporation that may receive map access. */
export interface AccessPrincipalOption {
  readonly ownerType: MapAccessOwnerType;
  readonly ownerId: number;
  readonly name: string;
  readonly imageUrl?: string;
}

/** A selected principal whose role remains null until the operator chooses it. */
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

/** User-facing plain-text label for one durable map role. */
export function mapRoleLabel(role: MapRole): string {
  return MAP_ROLE_LABELS[role];
}

/** Closed role choices for each editor mode; no choice is implied by selection. */
export function accessRolesForMode(mode: AccessEditorMode): readonly MapRole[] {
  return mode === 'create' ? CREATE_ROLES : MANAGE_ROLES;
}

/** Stable composite identity matching the durable unique grant key. */
export function accessPrincipalKey(
  principal: Pick<AccessPrincipalOption, 'ownerType' | 'ownerId'>,
): string {
  return `${principal.ownerType}:${principal.ownerId}`;
}

/** Converts one corporation option into the shared principal presentation shape. */
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

/**
 * Starts creation with the sole corporation selected when exactly one exists,
 * while deliberately leaving its role unchosen. Multiple or zero corporations
 * start private.
 */
export function initialCreationAccessDrafts(
  corporations: readonly CorporationAccessOption[],
): AccessGrantDraft[] {
  if (corporations.length !== 1) return [];
  const corporation = corporations[0];
  return corporation === undefined
    ? []
    : [{ ...corporationAccessPrincipal(corporation), role: null }];
}

/** Adds a principal once and never assigns an implicit access role. */
export function addAccessPrincipal(
  drafts: readonly AccessGrantDraft[],
  principal: AccessPrincipalOption,
): AccessGrantDraft[] {
  const key = accessPrincipalKey(principal);
  return drafts.some((draft) => accessPrincipalKey(draft) === key)
    ? [...drafts]
    : [...drafts, { ...principal, role: null }];
}

/** Removes only the addressed principal from the controlled draft list. */
export function removeAccessPrincipal(
  drafts: readonly AccessGrantDraft[],
  principal: Pick<AccessPrincipalOption, 'ownerType' | 'ownerId'>,
): AccessGrantDraft[] {
  const key = accessPrincipalKey(principal);
  return drafts.filter((draft) => accessPrincipalKey(draft) !== key);
}

/** Applies an explicit role only when that role belongs to the editor mode. */
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

/** Whether every selected principal has one explicit role valid for this mode. */
export function accessDraftsComplete(
  mode: AccessEditorMode,
  drafts: readonly AccessGrantDraft[],
): boolean {
  const roles = accessRolesForMode(mode);
  return drafts.every((draft) => draft.role !== null && roles.includes(draft.role));
}

/**
 * Converts a complete creation draft into the strict create endpoint shape.
 * Null means a selected principal still lacks a role; an empty array is valid
 * and intentionally creates a private map.
 */
export function createMapGrantsFromDrafts(
  drafts: readonly AccessGrantDraft[],
): CreateMapRequest['grants'] | null {
  if (!accessDraftsComplete('create', drafts)) return null;
  return drafts.map((draft) => {
    // Completeness above narrows the runtime state; creation also excludes admin.
    const role = draft.role as 'viewer' | 'editor';
    return {
      ownerType: draft.ownerType,
      ownerId: draft.ownerId,
      role,
    };
  });
}

/** One validated creation draft or the exact correction the form should request. */
export type PreparedMapCreation =
  | { readonly ok: true; readonly input: CreateMapRequest }
  | { readonly ok: false; readonly message: string };

/** Validates and normalizes the controlled creation draft before transport begins. */
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

/** Keeps a Base UI dismissal closed even while the prior result set still exists. */
export function characterSearchPopupOpen(
  requestedOpen: boolean,
  availableResultCount: number,
): boolean {
  return requestedOpen && availableResultCount > 0;
}

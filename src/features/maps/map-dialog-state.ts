import type { AuthorizedMapRow } from '@/data/maps/queries';

export interface AuthorityScopedMapDialogs {
  readonly authorityKey: string;
  readonly creationOpen: boolean;
  readonly trashOpen: boolean;
  readonly editingMapId: string | null;
}

export function currentAdminMap(
  maps: readonly AuthorizedMapRow[],
  editingMapId: string | null,
): AuthorizedMapRow | null {
  if (editingMapId === null) return null;
  const current = maps.find((map) => map.id === editingMapId);
  return current?.role === 'admin' ? current : null;
}

export function mapDialogAuthorityKey(
  listingAvailable: boolean,
  maps: readonly AuthorizedMapRow[],
): string {
  if (!listingAvailable) return 'unavailable';
  return `available:${maps
    .filter((map) => map.role === 'admin')
    .map((map) => map.id)
    .join('|')}`;
}

export function closedMapDialogs(authorityKey: string): AuthorityScopedMapDialogs {
  return {
    authorityKey,
    creationOpen: false,
    trashOpen: false,
    editingMapId: null,
  };
}

export function reconcileAuthorityScopedMapDialogs(
  state: AuthorityScopedMapDialogs,
  authorityKey: string,
): AuthorityScopedMapDialogs {
  return state.authorityKey === authorityKey ? state : closedMapDialogs(authorityKey);
}

export function dropLostAdminEdit(
  state: AuthorityScopedMapDialogs,
  currentAdmin: AuthorizedMapRow | null,
): AuthorityScopedMapDialogs {
  if (state.editingMapId === null || currentAdmin !== null) return state;
  return { ...state, editingMapId: null };
}

export function connectedDialogFocus(
  opener: HTMLElement | null | undefined,
  fallback: HTMLElement | null | undefined,
): HTMLElement | null {
  return opener?.isConnected ? opener : fallback ?? null;
}

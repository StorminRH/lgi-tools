import type { AuthorizedMapRow } from '@/data/maps/queries';

/** Dialog state tagged with the exact listing/admin authority identity that opened it. */
export interface AuthorityScopedMapDialogs {
  readonly authorityKey: string;
  readonly creationOpen: boolean;
  readonly trashOpen: boolean;
  readonly editingMapId: string | null;
}

/** Returns the refreshed row only while the addressed map retains admin authority. */
export function currentAdminMap(
  maps: readonly AuthorizedMapRow[],
  editingMapId: string | null,
): AuthorizedMapRow | null {
  if (editingMapId === null) return null;
  const current = maps.find((map) => map.id === editingMapId);
  return current?.role === 'admin' ? current : null;
}

/** Remount key that clears every dialog owner across listing or admin-authority transitions. */
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

/** Creates a closed dialog owner for one exact listing/admin authority identity. */
export function closedMapDialogs(authorityKey: string): AuthorityScopedMapDialogs {
  return {
    authorityKey,
    creationOpen: false,
    trashOpen: false,
    editingMapId: null,
  };
}

/** Drops retained dialog state before rendering under a different authority identity. */
export function reconcileAuthorityScopedMapDialogs(
  state: AuthorityScopedMapDialogs,
  authorityKey: string,
): AuthorityScopedMapDialogs {
  return state.authorityKey === authorityKey ? state : closedMapDialogs(authorityKey);
}

/** Clears a retained access-edit id once the addressed map no longer has admin authority. */
export function dropLostAdminEdit(
  state: AuthorityScopedMapDialogs,
  currentAdmin: AuthorizedMapRow | null,
): AuthorityScopedMapDialogs {
  if (state.editingMapId === null || currentAdmin !== null) return state;
  return { ...state, editingMapId: null };
}

/** Returns the opener while it is still mounted, otherwise the dialog owner fallback. */
export function connectedDialogFocus(
  opener: HTMLElement | null | undefined,
  fallback: HTMLElement | null | undefined,
): HTMLElement | null {
  return opener?.isConnected ? opener : fallback ?? null;
}

'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import type { AuthorizedMapRow } from '@/data/maps/queries';
import {
  closedMapDialogs,
  currentAdminMap,
  dropLostAdminEdit,
  mapDialogAuthorityKey,
  reconcileAuthorityScopedMapDialogs,
  type AuthorityScopedMapDialogs,
} from './map-dialog-state';

/**
 * The create, trash and access-edit dialogs of a map host. Losing the map
 * listing closes all three, and they stay closed when it comes back. An access
 * edit also closes when its own map is no longer admin; a role change on any
 * other map leaves it open. The state is reconciled during render, so a
 * closed dialog never shows for a frame.
 */
export function useAuthorityScopedMapDialogs(
  maps: readonly AuthorizedMapRow[],
  listingAvailable: boolean,
): {
  readonly dialogs: AuthorityScopedMapDialogs;
  readonly setDialogs: Dispatch<SetStateAction<AuthorityScopedMapDialogs>>;
  /** The admin map being edited: non-null exactly when `dialogs.editingMapId` is. */
  readonly editingMap: AuthorizedMapRow | null;
} {
  const authorityKey = mapDialogAuthorityKey(listingAvailable);
  const [storedDialogs, setDialogs] = useState(() => closedMapDialogs(authorityKey));
  const reconciled = reconcileAuthorityScopedMapDialogs(storedDialogs, authorityKey);
  const editingMap = currentAdminMap(maps, reconciled.editingMapId);
  const dialogs = dropLostAdminEdit(reconciled, editingMap);
  if (dialogs !== storedDialogs) setDialogs(dialogs);
  return { dialogs, setDialogs, editingMap };
}

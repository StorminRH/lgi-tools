import { describe, expect, it } from 'vitest';
import type { AuthorizedMapRow } from '@/data/maps/queries';
import {
  closedMapDialogs,
  connectedDialogFocus,
  currentAdminMap,
  dropLostAdminEdit,
  mapDialogAuthorityKey,
  reconcileAuthorityScopedMapDialogs,
} from './map-dialog-state';

const ADMIN_MAP: AuthorizedMapRow = {
  id: 'map-admin',
  name: 'Admin map',
  createdAt: new Date('2026-08-12T12:00:00.000Z'),
  creatorName: 'Mapper',
  role: 'admin',
  provenance: { kind: 'created' },
};

describe('map dialog state', () => {
  it('closes create/trash/edit across authority loss and keeps recovery closed', () => {
    expect(currentAdminMap([ADMIN_MAP], ADMIN_MAP.id)).toBe(ADMIN_MAP);
    expect(
      currentAdminMap([{ ...ADMIN_MAP, role: 'editor' }], ADMIN_MAP.id),
    ).toBeNull();
    expect(currentAdminMap([], ADMIN_MAP.id)).toBeNull();

    const authorized = mapDialogAuthorityKey(true, [ADMIN_MAP]);
    const unavailable = mapDialogAuthorityKey(false, []);
    const downgraded = mapDialogAuthorityKey(true, [
      { ...ADMIN_MAP, role: 'editor' },
    ]);
    const recovered = mapDialogAuthorityKey(true, [ADMIN_MAP]);

    const opened = {
      ...closedMapDialogs(authorized),
      creationOpen: true,
      trashOpen: true,
      editingMapId: ADMIN_MAP.id,
    };
    const lost = reconcileAuthorityScopedMapDialogs(opened, unavailable);
    const downgradedState = reconcileAuthorityScopedMapDialogs(opened, downgraded);
    const recoveredClosed = reconcileAuthorityScopedMapDialogs(lost, recovered);

    expect(lost).toEqual(closedMapDialogs('unavailable'));
    expect(downgradedState).toEqual(closedMapDialogs('available:'));
    expect(recoveredClosed).toEqual(closedMapDialogs('available:map-admin'));

    const listingOnly = mapDialogAuthorityKey(true, []);
    const listingOpened = {
      ...closedMapDialogs(listingOnly),
      trashOpen: true,
      creationOpen: true,
    };
    expect(reconcileAuthorityScopedMapDialogs(listingOpened, listingOnly)).toBe(
      listingOpened,
    );
    expect(
      reconcileAuthorityScopedMapDialogs(
        listingOpened,
        mapDialogAuthorityKey(true, [ADMIN_MAP]),
      ),
    ).toEqual(closedMapDialogs('available:map-admin'));
  });

  it('drops a lost access-edit id without closing create or trash, and focuses a connected opener', () => {
    const listingOnly = mapDialogAuthorityKey(true, []);
    const opened = {
      ...closedMapDialogs(listingOnly),
      trashOpen: true,
      creationOpen: true,
      editingMapId: ADMIN_MAP.id,
    };
    expect(dropLostAdminEdit(opened, ADMIN_MAP)).toBe(opened);

    const lost = dropLostAdminEdit(opened, null);
    expect(lost).toEqual({ ...opened, editingMapId: null });
    expect(lost.trashOpen).toBe(true);
    expect(lost.creationOpen).toBe(true);

    const recovered = dropLostAdminEdit(
      reconcileAuthorityScopedMapDialogs(lost, listingOnly),
      ADMIN_MAP,
    );
    expect(recovered.editingMapId).toBeNull();
    expect(recovered.trashOpen).toBe(true);

    const opener = { isConnected: true } as HTMLElement;
    const fallback = { isConnected: true } as HTMLElement;
    expect(connectedDialogFocus(opener, fallback)).toBe(opener);
    expect(connectedDialogFocus({ isConnected: false } as HTMLElement, fallback)).toBe(
      fallback,
    );
    expect(connectedDialogFocus(null, fallback)).toBe(fallback);
    expect(connectedDialogFocus(undefined, undefined)).toBeNull();
  });
});

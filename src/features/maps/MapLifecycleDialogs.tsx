'use client';

import type { DialogFocusTarget } from '@/components/ui/dialog';
import type { CorporationAccessOption } from '@/data/maps/access-contract';
import type { DeletedRestorableMapRow } from '@/data/maps/queries';
import { MapCreationDialog } from './MapCreationDialog';
import { TrashWindow } from './TrashWindow';

/** Shared create and trash doors for the Atlas menu and landing catalogue. */
export function MapLifecycleDialogs({
  creationOpen,
  trashOpen,
  onCreationOpenChange,
  onTrashOpenChange,
  corporations,
  deletedMaps,
  creationFocus,
  trashFocus,
}: {
  readonly creationOpen: boolean;
  readonly trashOpen: boolean;
  readonly onCreationOpenChange: (open: boolean) => void;
  readonly onTrashOpenChange: (open: boolean) => void;
  readonly corporations: readonly CorporationAccessOption[];
  readonly deletedMaps: readonly DeletedRestorableMapRow[];
  readonly creationFocus: DialogFocusTarget;
  readonly trashFocus: DialogFocusTarget;
}) {
  return (
    <>
      <MapCreationDialog
        open={creationOpen}
        onOpenChange={onCreationOpenChange}
        corporations={corporations}
        openerRef={creationFocus}
      />
      <TrashWindow
        open={trashOpen}
        onOpenChange={onTrashOpenChange}
        maps={deletedMaps}
        finalFocus={trashFocus}
      />
    </>
  );
}

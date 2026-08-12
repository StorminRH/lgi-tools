'use client';

import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { CorporationAccessOption } from '@/data/maps/access-contract';
import type { DeletedRestorableMapRow } from '@/data/maps/queries';
import { MapCreationDialog } from './MapCreationDialog';
import { TrashWindow } from './TrashWindow';
import {
  connectedDialogFocus,
  type AuthorityScopedMapDialogs,
} from './map-dialog-state';

/** Shared create and trash doors for the Atlas menu and landing catalogue. */
export function MapLifecycleDialogs({
  dialogs,
  onDialogsChange,
  corporations,
  deletedMaps,
  creationOpenerRef,
  trashOpenerRef,
  hostRef,
}: {
  readonly dialogs: Pick<AuthorityScopedMapDialogs, 'creationOpen' | 'trashOpen'>;
  readonly onDialogsChange: Dispatch<SetStateAction<AuthorityScopedMapDialogs>>;
  readonly corporations: readonly CorporationAccessOption[];
  readonly deletedMaps: readonly DeletedRestorableMapRow[];
  readonly creationOpenerRef: RefObject<HTMLElement | null>;
  readonly trashOpenerRef: RefObject<HTMLElement | null>;
  readonly hostRef: RefObject<HTMLElement | null>;
}) {
  return (
    <>
      <MapCreationDialog
        open={dialogs.creationOpen}
        onOpenChange={(open) =>
          onDialogsChange((current) => ({ ...current, creationOpen: open }))
        }
        corporations={corporations}
        openerRef={() =>
          connectedDialogFocus(creationOpenerRef.current, hostRef.current)
        }
      />
      <TrashWindow
        open={dialogs.trashOpen}
        onOpenChange={(open) =>
          onDialogsChange((current) => ({ ...current, trashOpen: open }))
        }
        maps={deletedMaps}
        finalFocus={() =>
          connectedDialogFocus(trashOpenerRef.current, hostRef.current)
        }
      />
    </>
  );
}

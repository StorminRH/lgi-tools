'use client';

import type { RefObject } from 'react';
import { PointerPopover } from '@/components/ui/popover';
import { pointerAnchor } from '@/components/ui/overlay-positioning';
import type {
  ConnectionDetail,
  ConnectionEditorDetail,
} from '../chain/use-map-chain';
import {
  applyWormholeType,
  type ConnectionAuthoringApi,
} from '../authoring/ConnectionAuthoringOverlay';
import { connectionFieldSetters } from '../authoring/connection-field-setters';
import { ConnectionFields } from '../authoring/connection-fields';
import { useWormholeEditorData } from '../authoring/use-wormhole-editor-data';

/** Pointer placement and focus-return owner for one signature-row editor. */
export interface WormholeRowEditorAnchor {
  readonly clientX: number;
  readonly clientY: number;
  readonly finalFocus: RefObject<HTMLElement | null>;
}

/** Whether the row's connection has a resolved destination (card-parity path). */
function isResolvedConnection(
  connection: ConnectionEditorDetail,
): connection is ConnectionDetail {
  return connection.toSystemId !== null;
}

/** Reuses the shipped connection fields for one unresolved or resolved signature row. */
export function WormholeRowEditor({
  mapId,
  connection,
  authoring,
  anchor,
  now,
  onOpenChange,
}: {
  readonly mapId: string;
  readonly connection: ConnectionEditorDetail;
  readonly authoring: ConnectionAuthoringApi;
  readonly anchor: WormholeRowEditorAnchor;
  readonly now: number;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { codes, preferredCodes, entry, codexReady } = useWormholeEditorData(
    connection.fromSystemId,
    connection.wormholeTypeCode,
  );

  return (
    <PointerPopover
      open
      onOpenChange={onOpenChange}
      anchor={pointerAnchor(anchor.clientX, anchor.clientY)}
      label={`Edit wormhole ${connection.fromSignatureId ?? ''}`.trim()}
      finalFocus={anchor.finalFocus}
      className="gap-3"
    >
      <ConnectionFields
        connection={connection}
        codes={codes}
        preferredCodes={preferredCodes}
        codexReady={codexReady}
        entry={entry}
        setters={connectionFieldSetters(mapId, connection, authoring, (value) => {
          // Parity with the connection card: type entry on a RESOLVED row runs
          // the same typed-hole notification (observation emit + superseded-row
          // repair), so identical user intent cannot produce divergent Neon
          // state. A scanned unresolved stub needs no second channel — its
          // setter already cascades the elimination pass, which logs that row's
          // identity at its own tier and corrects the key in place (ruling D-B).
          if (isResolvedConnection(connection)) {
            void applyWormholeType({ mapId, connection, value, authoring });
            return;
          }
          void authoring.setConnectionWormholeType({ mapId, connection, value });
        })}
        now={now}
        mode="edit"
      />
    </PointerPopover>
  );
}

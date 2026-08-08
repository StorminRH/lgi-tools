'use client';

import type { RefObject } from 'react';
import { PointerPopover } from '@/components/ui/popover';
import { pointerAnchor } from '@/components/ui/overlay-positioning';
import type { ConnectionEditorDetail } from '../chain/use-map-chain';
import type { ConnectionAuthoringApi } from '../authoring/ConnectionAuthoringOverlay';
import { connectionFieldSetters } from '../authoring/connection-field-setters';
import { ConnectionFields } from '../authoring/connection-fields';
import { useWormholeEditorData } from '../authoring/use-wormhole-editor-data';

/** Pointer placement and focus-return owner for one signature-row editor. */
export interface WormholeRowEditorAnchor {
  readonly clientX: number;
  readonly clientY: number;
  readonly finalFocus: RefObject<HTMLElement | null>;
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
        setters={connectionFieldSetters(mapId, connection, authoring)}
        now={now}
        mode="edit"
      />
    </PointerPopover>
  );
}

'use client';

// The one Signature Editor (4.0.4.3.2 rulings D-F / D-G).
//
// A single pop-out parked beside the scanner dock, opened by a left-click on a
// scanner wormhole row or by Edit on a connection line's right-click menu.
// It is deliberately NOT anchored to canvas geometry: React Flow pans and
// zooms by mutating a viewport transform, which fires neither scroll nor
// resize, so no floating anchor can track an edge honestly (docs brief). The
// tie back to the originating row is drawn instead — a bracket beside the row
// and a leader line into the panel, both from the pure `editorLeader` rule.
import type { SystemIdentityReadout } from '@/data/eve-data/system-identity';
import {
  ConnectionFields,
  type ConnectionFieldSetters,
} from '../authoring/connection-fields';
import { useWormholeEditorData } from '../authoring/use-wormhole-editor-data';
import type { ConnectionEditorDetail } from '../chain/use-map-chain';
import { ScannerAnchoredPanel } from './ScannerAnchoredPanel';

/** Props for the scanner-anchored Signature Editor pop-out. */
export interface SignatureEditorProps {
  readonly connection: ConnectionEditorDetail;
  readonly setters: ConnectionFieldSetters;
  readonly now: number;
  readonly mode: 'edit' | 'restore';
  /** The destination's identity readout once the hole is resolved. */
  readonly destination: SystemIdentityReadout | null;
  readonly onFocusDestination?: () => void;
  readonly onDelete: () => void;
  readonly onRestore: () => void;
  readonly onClose: () => void;
}

/**
 * The editor pop-out: shared scanner chrome plus the ruling D-G field body.
 * Typed codes resolve through the session wormhole codex for the stats block
 * and the size lock.
 */
export function SignatureEditor({
  connection,
  setters,
  now,
  mode,
  destination,
  onFocusDestination,
  onDelete,
  onRestore,
  onClose,
}: SignatureEditorProps) {
  const { codes, preferredCodes, entry, codexReady } = useWormholeEditorData(
    connection.fromSystemId,
    connection.wormholeTypeCode,
  );

  return (
    <ScannerAnchoredPanel
      signatureId={connection.fromSignatureId}
      windowId="signature-editor"
      title="Signature Editor"
      onClose={onClose}
      layerProps={{ 'data-map-connection-mode': mode }}
    >
      <ConnectionFields
        connection={connection}
        codes={codes}
        preferredCodes={preferredCodes}
        codexReady={codexReady}
        entry={entry}
        setters={setters}
        now={now}
        mode={mode}
        destination={destination}
        onFocusDestination={onFocusDestination}
        onDelete={onDelete}
        onRestore={onRestore}
      />
    </ScannerAnchoredPanel>
  );
}

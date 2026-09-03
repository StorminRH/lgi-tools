'use client';

import type { SystemIdentityReadout } from '@/data/eve-data/system-identity';
import {
  ConnectionFields,
  type ConnectionFieldSetters,
  type OriginLeadOption,
} from '../authoring/connection-fields';
import { useWormholeEditorData } from '../authoring/use-wormhole-editor-data';
import type { ConnectionEditorDetail } from '../chain/connection-detail';
import { ScannerAnchoredPanel } from './ScannerAnchoredPanel';

export interface SignatureEditorProps {
  readonly connection: ConnectionEditorDetail;
  readonly anchorSignatureId?: string | null;
  readonly setters: ConnectionFieldSetters;
  readonly now: number;
  readonly mode: 'edit' | 'restore';
  readonly destination: SystemIdentityReadout | null;
  readonly originLeads?: readonly OriginLeadOption[];
  readonly onDelete: () => void;
  readonly onRestore: () => void;
  readonly onClose: () => void;
}

export function SignatureEditor({
  connection,
  anchorSignatureId = null,
  setters,
  now,
  mode,
  destination,
  originLeads = [],
  onDelete,
  onRestore,
  onClose,
}: SignatureEditorProps) {
  const { codes, preferredCodes, entry, codexReady } = useWormholeEditorData(
    connection.fromSystemId,
    connection.from.typeCode,
  );

  return (
    <ScannerAnchoredPanel
      signatureId={anchorSignatureId ?? connection.from.signatureId}
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
        originLeads={originLeads}
        onDelete={onDelete}
        onRestore={onRestore}
      />
    </ScannerAnchoredPanel>
  );
}

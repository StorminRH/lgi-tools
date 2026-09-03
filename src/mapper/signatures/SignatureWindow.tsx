'use client';

import { useMemo } from 'react';
import { toast } from '@/components/ui/toast';
import type { SigGroup } from '@/data/maps/scan-parse';
import {
  ScannerLivePricesProvider,
  useSiteCatalogue,
} from '@/features/wormhole-sites/widget';
import type { ConnectionFieldSetters } from '../authoring/connection-fields';
import type { OriginLeadConnection } from '../authoring/leads-to-origin';
import type { ConnectionEditorDetail } from '../chain/connection-detail';
import { MAP_SCANNER_DOCK_STACK_CLASS } from '../windows/MapWindow';
import type {
  JumpResolutionCandidate,
  JumpResolutionModel,
} from './jump-resolution';
import { ScannerPromptRail } from './scanner-prompt-rail';
import { ScannerWindowFrame } from './scanner-window-frame';
import type { OpenSignatureEditor } from './signature-context';
import {
  applyScannerRowOpenAction,
  scannerRowOpenAction,
} from './scanner-row-open';
import {
  scannerSectionForGroup,
  type SignatureWindowRow,
} from './signature-model';

export interface SignatureWindowProps {
  readonly scannerSystemId: number | null;
  readonly rows: readonly SignatureWindowRow[];
  readonly missingIds: ReadonlySet<string>;
  readonly missingCount: number;
  readonly canEdit: boolean;
  readonly complete: boolean;
  readonly now: number;
  readonly onDismissMissing: () => void;
  readonly onRemoveMissing: () => Promise<void>;
  readonly jumpResolution: JumpResolutionModel | null;
  readonly onPickJumpCandidate: (candidate: JumpResolutionCandidate) => void;
  readonly onIdentify: (
    row: SignatureWindowRow,
    group: SigGroup,
    wormholeTypeCode?: string,
  ) => Promise<void>;
  readonly onOpenEditor: OpenSignatureEditor;
  readonly onOpenSite: (siteId: number, signatureId: string) => void;
  readonly bindConnectionSetters?: (
    connection: ConnectionEditorDetail,
    side?: 'from' | 'to',
  ) => ConnectionFieldSetters;
  readonly originLeadConnections?: readonly OriginLeadConnection[];
}

function harvestableNamesForScanner(
  rows: readonly SignatureWindowRow[],
  scannerSystemId: number | null,
): string[] {
  if (scannerSystemId === null) return [];
  const names: string[] = [];
  for (const row of rows) {
    if (row.systemId !== scannerSystemId || row.name === null) continue;
    if (scannerSectionForGroup(row.group) !== 'harvestables') continue;
    names.push(row.name);
  }
  return names;
}

export function SignatureWindow(props: SignatureWindowProps) {
  const catalogue = useSiteCatalogue();
  const resolveSiteId = catalogue.siteIdForName;
  const harvestableNames = useMemo(
    () => harvestableNamesForScanner(props.rows, props.scannerSystemId),
    [props.rows, props.scannerSystemId],
  );
  const removeMissing = () => {
    void props.onRemoveMissing().catch(() => {
      toast.error('The signatures could not be removed. Try again.', {
        id: 'signature-remove:batch',
      });
    });
  };
  const identifyRow = (
    row: SignatureWindowRow,
    group: SigGroup,
    wormholeTypeCode?: string,
  ) =>
    props.onIdentify(row, group, wormholeTypeCode).catch(() => {
      toast.error('The signature could not be identified.', {
        id: `signature-identify:${row.systemId}:${row.signatureId}`,
      });
    });
  const openRowActions = (
    row: SignatureWindowRow,
    trigger: HTMLElement,
    clientX: number,
    clientY: number,
  ) => {
    applyScannerRowOpenAction(
      scannerRowOpenAction(row, props.canEdit, resolveSiteId),
      {
        openEditor: props.onOpenEditor,
        openSite: props.onOpenSite,
      },
      { row, trigger, clientX, clientY },
    );
  };

  return (
    <ScannerLivePricesProvider harvestableNames={harvestableNames}>
      <div
        data-signature-window-layer
        className="pointer-events-none absolute inset-0 z-sticky"
      >
        <div
          data-scanner-dock-stack
          className={MAP_SCANNER_DOCK_STACK_CLASS}
        >
          <ScannerPromptRail
            missingCount={props.missingCount}
            canEdit={props.canEdit}
            onDismissMissing={props.onDismissMissing}
            onRemoveMissing={removeMissing}
            jumpResolution={props.jumpResolution}
            onPickJumpCandidate={props.onPickJumpCandidate}
          />
          <ScannerWindowFrame
            scannerSystemId={props.scannerSystemId}
            rows={props.rows}
            missingIds={props.missingIds}
            canEdit={props.canEdit}
            complete={props.complete}
            now={props.now}
            bindConnectionSetters={props.bindConnectionSetters}
            originLeadConnections={props.originLeadConnections}
            resolveSiteId={resolveSiteId}
            onIdentify={identifyRow}
            onOpenActions={openRowActions}
          />
        </div>
      </div>
    </ScannerLivePricesProvider>
  );
}

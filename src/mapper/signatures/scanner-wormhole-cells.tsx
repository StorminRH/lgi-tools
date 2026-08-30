'use client';

import { useCallback, useMemo, type ReactNode } from 'react';
import { systemClassText } from '@/data/eve-data/system-identity';
import type { SigGroup } from '@/data/maps/scan-parse';
import type { ConnectionFieldSetters } from '../authoring/connection-fields';
import type { OriginLeadConnection } from '../authoring/leads-to-origin';
import { useWormholeEditorData } from '../authoring/use-wormhole-editor-data';
import { useUniverseAssets } from '../chain/use-universe-assets';
import type { ConnectionEditorDetail } from '../chain/connection-detail';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import { namedDoorType } from '@/data/maps/connection-door-types';
import { doorLeadsTo } from '@/data/maps/connection-door-destinations';
import { doorHint, hallwayDoorTypes, lifetimeStage } from '@/data/maps/connection-hallway';
import { originLeadOptions } from './origin-leads';
import { IdCell, NameCell } from './scanner-row-cells';
import { ScannerLeadsControl, scannerLeadsReadout } from './scanner-leads-control';
import { ScannerLifeSelect, scannerLifeReadout } from './scanner-life-select';
import { ScannerMassSelect, scannerMassReadout } from './scanner-mass-select';
import { ScannerTypeCombo } from './scanner-type-combo';
import {
  scannerLifeUpperBound,
  type SignatureWindowRow,
} from './signature-model';
import { destinationReadout } from './system-readout';

function scannerCellKey(
  kind: 'type' | 'leads',
  connectionId: string,
  value: string,
): string {
  return `${kind}:${connectionId}:${value}`;
}

export function scannerTypeCellKey(
  connectionId: string,
  typeName: string | null,
): string {
  return scannerCellKey('type', connectionId, typeName ?? '');
}

export function scannerLeadsCellKey(
  connectionId: string,
  destinationLabel: string | null | undefined,
  hint: string | null | undefined,
): string {
  return scannerCellKey('leads', connectionId, destinationLabel ?? hint ?? '');
}

export interface WormholeCellContext {
  readonly now: number;
  readonly canEdit: boolean;
  readonly codes: readonly string[];
  readonly preferredCodes: readonly string[];
  readonly classLabelOf: (code: string) => string | null;
  readonly destinationOf: (
    connection: ConnectionEditorDetail,
  ) => ReturnType<typeof destinationReadout>;
  readonly bindConnectionSetters?: (
    connection: ConnectionEditorDetail,
    side?: 'from' | 'to',
  ) => ConnectionFieldSetters;
  readonly entryOf: (
    connection: ConnectionEditorDetail,
  ) => WormholeCodexEntry | null;
  readonly originLeadsOf: (
    connection: ConnectionEditorDetail,
  ) => ReturnType<typeof originLeadOptions>;
  readonly onIdentify?: (
    row: SignatureWindowRow,
    group: SigGroup,
    wormholeTypeCode?: string,
  ) => void;
}

export function useWormholeCellContext({
  scannerSystemId,
  now,
  canEdit,
  bindConnectionSetters,
  originLeadConnections,
  onIdentify,
}: {
  readonly scannerSystemId: number | null;
  readonly now: number;
  readonly canEdit: boolean;
  readonly bindConnectionSetters?: WormholeCellContext['bindConnectionSetters'];
  readonly originLeadConnections: readonly OriginLeadConnection[];
  readonly onIdentify?: WormholeCellContext['onIdentify'];
}): WormholeCellContext {
  const editorData = useWormholeEditorData(scannerSystemId ?? 0, null);
  const assets = useUniverseAssets();
  const classLabelOf = useCallback((code: string): string | null => {
    const entry = editorData.codex?.byCode(code) ?? null;
    if (entry === null || entry.farSide) return null;
    return systemClassText(entry.targetClass);
  }, [editorData.codex]);
  return useMemo(() => {
    const systemInfo =
      assets === null ? null : (id: number) => assets.systemInfo(id);
    return {
      now,
      canEdit,
      codes: editorData.codes,
      preferredCodes: editorData.preferredCodes,
      classLabelOf,
      destinationOf: (connection) =>
        destinationReadout(connection.toSystemId, systemInfo),
      bindConnectionSetters,
      entryOf: (connection) => {
        const code = namedDoorType(hallwayDoorTypes(connection)).typeCode;
        if (code === null) return null;
        return editorData.codex?.byCode(code) ?? null;
      },
      originLeadsOf: (connection) =>
        originLeadOptions(connection, originLeadConnections, systemInfo),
      onIdentify,
    };
  }, [
    now,
    canEdit,
    editorData.codes,
    editorData.preferredCodes,
    editorData.codex,
    classLabelOf,
    assets,
    bindConnectionSetters,
    originLeadConnections,
    onIdentify,
  ]);
}

function scannerRowDestination(
  row: SignatureWindowRow,
  ctx: WormholeCellContext,
) {
  const connection = row.connection;
  if (connection === null) return null;
  return ctx.destinationOf({
    ...connection,
    toSystemId: doorLeadsTo(
      connection.fromSystemId,
      connection.toSystemId,
      row.endpoint ?? 'from',
      row.endpoint === 'to' ? connection.to : connection.from,
    ),
  });
}

function scannerRowHint(
  connection: SignatureWindowRow['connection'],
  farSide: boolean,
) {
  if (connection === null) return null;
  return farSide ? doorHint(connection.to) : doorHint(connection.from);
}

function ReadOnlyWormholeCells({
  row,
  connection,
  destination,
  lifeText,
  farSide,
  now,
}: {
  readonly row: SignatureWindowRow;
  readonly connection: SignatureWindowRow['connection'];
  readonly destination: ReturnType<WormholeCellContext['destinationOf']> | null;
  readonly lifeText: string;
  readonly farSide: boolean;
  readonly now: number;
}) {
  return (
    <>
      <IdCell row={row} now={now} />
      <span className="flex min-w-0 items-baseline gap-1.5">
        <NameCell row={row} />
        {row.className !== null ? (
          <span
            data-signature-class
            className="shrink-0 font-ui text-micro uppercase tracking-label text-muted"
          >
            {row.className}
          </span>
        ) : null}
      </span>
      <span className="truncate text-muted">
        <span className="sr-only">{`Mass ${row.signatureId} `}</span>
        {scannerMassReadout(connection?.massState ?? null)}
      </span>
      <span className="truncate text-muted">
        <span className="sr-only">{`Reliable Lifetime ${row.signatureId} `}</span>
        {lifeText}
      </span>
      <span className="truncate text-muted">
        <span className="sr-only">{`Destination ${row.signatureId} `}</span>
        {scannerLeadsReadout(scannerRowHint(connection, farSide), destination)}
      </span>
    </>
  );
}

export function wormholeCells(
  row: SignatureWindowRow,
  ctx: WormholeCellContext,
): ReactNode {
  const connection = row.connection;
  const farSide = row.endpoint === 'to';
  const setters =
    ctx.canEdit && connection !== null
      ? ctx.bindConnectionSetters?.(connection, row.endpoint ?? 'from')
      : undefined;
  const destination = scannerRowDestination(row, ctx);
  const entry = connection === null ? null : ctx.entryOf(connection);
  const lifeEstimate = scannerLifeUpperBound(connection, entry, ctx.now);
  const lifeText =
    lifeEstimate === '—'
      ? scannerLifeReadout(
          connection === null ? null : lifetimeStage(connection.lifetime),
        )
      : lifeEstimate;
  const hint = scannerRowHint(connection, farSide);
  if (setters === undefined || connection === null) {
    return (
      <ReadOnlyWormholeCells
        row={row}
        connection={connection}
        destination={destination}
        lifeText={lifeText}
        farSide={farSide}
        now={ctx.now}
      />
    );
  }
  return (
    <>
      <IdCell row={row} now={ctx.now} />
      <ScannerTypeCombo
        key={scannerTypeCellKey(connection.connectionId, row.name)}
        code={row.name}
        className={row.className}
        codes={ctx.codes}
        preferredCodes={ctx.preferredCodes}
        classLabelOf={ctx.classLabelOf}
        rowId={row.signatureId}
        disabled={false}
        onCommit={setters.setWormholeType}
      />
      <ScannerMassSelect
        value={connection.massState}
        rowId={row.signatureId}
        disabled={false}
        onChange={setters.setMassState}
      />
      <ScannerLifeSelect
        value={lifetimeStage(connection.lifetime)}
        connection={connection}
        entry={entry}
        now={ctx.now}
        rowId={row.signatureId}
        disabled={false}
        onChange={setters.setLifeStage}
      />
      <ScannerLeadsControl
        key={scannerLeadsCellKey(
          connection.connectionId,
          destination?.label,
          hint,
        )}
        hint={hint}
        destination={destination}
        originLeads={ctx.originLeadsOf(connection)}
        originSystemId={
          farSide && connection.toSystemId !== null
            ? connection.toSystemId
            : connection.fromSystemId
        }
        rowId={row.signatureId}
        disabled={false}
        onChange={setters.setLeadsTo}
        onSetDestination={setters.setDestination}
        onLinkOrigin={setters.linkToOrigin}
      />
    </>
  );
}

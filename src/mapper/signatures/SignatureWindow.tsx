'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { scrollAreaStart } from '@/components/ui/scroll-area';
import { Collapsible } from '@/components/ui/collapsible';
import { toast } from '@/components/ui/toast';
import { Tooltip } from '@/components/ui/tooltip';
import { systemClassText } from '@/data/eve-data/system-identity';
import type { SigGroup } from '@/data/maps/scan-parse';
import {
  ScannerEstIskCell,
  ScannerLivePricesProvider,
  useSiteCatalogue,
} from '@/features/wormhole-sites/widget';
import type { ConnectionFieldSetters } from '../authoring/connection-fields';
import type { OriginLeadConnection } from '../authoring/leads-to-origin';
import { useWormholeEditorData } from '../authoring/use-wormhole-editor-data';
import { useUniverseAssets } from '../chain/use-map-chain';
import type { ConnectionEditorDetail } from '../chain/use-map-chain';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import { namedDoorType } from '@/data/maps/connection-door-types';
import { mapFrostedSurface } from '../map-frosted-surface';
import {
  MAP_SCANNER_DOCK_STACK_CLASS,
  MAP_SCANNER_PROMPT_RAIL_CLASS,
  MapWindow,
} from '../windows/MapWindow';
import { SignatureJumpPrompt } from './SignatureJumpPrompt';
import type {
  JumpResolutionCandidate,
  JumpResolutionModel,
} from './jump-resolution';
import {
  formatSignatureAge,
  groupSignatureSections,
  scannerGroupTypeLabel,
  scannerLifeUpperBound,
  scannerSectionForGroup,
  type ScannerSection,
  type ScannerSectionId,
  type SignatureWindowRow,
} from './signature-model';
import {
  ScannerIdentifyCombo,
  ScannerLeadsControl,
  ScannerLifeSelect,
  ScannerMassSelect,
  ScannerTypeCombo,
  scannerLeadsReadout,
  scannerLifeReadout,
  scannerMassReadout,
} from './scanner-inline-cells';
import { doorLeadsTo } from '@/data/maps/connection-door-destinations';
import { doorHint, hallwayDoorTypes, lifetimeStage } from '@/data/maps/connection-hallway';
import { originLeadOptions } from './origin-leads';
import { destinationReadout } from './system-readout';
import type { OpenSignatureEditor } from './signature-context';
import {
  applyScannerRowOpenAction,
  scannerRowOpenAction,
  scannerRowShowsOpenAffordance,
} from './scanner-row-open';
import {
  ScannerScrollEpochProvider,
  useScannerScrollBump,
} from './scanner-scroll-dismiss';

type OpenRowActions = (
  trigger: HTMLElement,
  clientX: number,
  clientY: number,
) => void;

/** Remount key for the Type combo — prefixed so an empty type cannot collide
 *  with Destination in the same wormhole row. */
export function scannerTypeCellKey(
  connectionId: string,
  typeName: string | null,
): string {
  return `type:${connectionId}:${typeName ?? ''}`;
}

/** Remount key for the Destination combo — prefixed so an empty dest/hint
 *  cannot collide with Type in the same wormhole row. */
export function scannerLeadsCellKey(
  connectionId: string,
  destinationLabel: string | null | undefined,
  hint: string | null | undefined,
): string {
  return `leads:${connectionId}:${destinationLabel ?? hint ?? ''}`;
}

function openRowActionsAtStart(
  trigger: HTMLElement,
  onOpenActions: OpenRowActions,
): void {
  const bounds = trigger.getBoundingClientRect();
  onOpenActions(trigger, bounds.left + 12, bounds.top + 12);
}

function SignalFill({ signalPct }: { readonly signalPct: number | null }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.style.setProperty(
      '--signature-signal',
      `${Math.max(0, Math.min(100, signalPct ?? 0))}%`,
    );
  }, [signalPct]);
  return <div ref={ref} data-signature-signal-fill aria-hidden />;
}

interface SignatureRowProps {
  readonly row: SignatureWindowRow;
  readonly missing: boolean;
  readonly canEdit: boolean;
  readonly resolveSiteId: (name: string) => number | null;
  readonly columnsClassName: string;
  readonly cells: ReactNode;
  readonly showOpenAffordance: boolean;
  readonly onOpenActions: OpenRowActions;
}

function missingDataAttribute(missing: boolean): true | undefined {
  return missing ? true : undefined;
}

function signatureRowTone(missing: boolean): string {
  return missing ? 'map-signature-missing' : 'text-text';
}

function signatureName(row: SignatureWindowRow): string {
  return row.name ?? 'Unresolved';
}

/** Screen-reader action verb prefixed ahead of the row's visible cells. */
function rowActionPrefix(
  row: SignatureWindowRow,
  canEdit: boolean,
  resolveSiteId: (name: string) => number | null,
): string {
  const action = scannerRowOpenAction(row, canEdit, resolveSiteId);
  if (action?.kind === 'connection') return 'Edit wormhole';
  if (action?.kind === 'site') return 'View site';
  return 'Open signature';
}

const SECTION_COLUMNS: Readonly<Record<ScannerSectionId, string>> = {
  unknown:
    'grid w-full min-w-0 grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2.5 [&>*]:min-w-0',
  wormholes:
    'grid w-full min-w-0 grid-cols-[4.25rem_minmax(0,4.75rem)_minmax(0,4rem)_minmax(0,3.5rem)_minmax(0,1fr)] items-center gap-2.5 [&>*]:min-w-0',
  combat:
    'grid w-full min-w-0 grid-cols-[4.25rem_minmax(0,1fr)_3.6rem] items-center gap-2.5 [&>*]:min-w-0',
  harvestables:
    'grid w-full min-w-0 grid-cols-[4.25rem_3.75rem_minmax(0,1fr)_3.6rem] items-center gap-2.5 [&>*]:min-w-0',
  hacking:
    'grid w-full min-w-0 grid-cols-[4.25rem_3.75rem_minmax(0,1fr)] items-center gap-2.5 [&>*]:min-w-0',
};

function SignatureRowContent({
  row,
  interactive,
  canEdit,
  resolveSiteId,
  onOpenActions,
  columnsClassName,
  children,
}: {
  readonly row: SignatureWindowRow;
  readonly interactive: boolean;
  readonly canEdit: boolean;
  readonly resolveSiteId: (name: string) => number | null;
  readonly onOpenActions: OpenRowActions;
  readonly columnsClassName: string;
  readonly children: ReactNode;
}) {
  const className = cn(
    'relative z-base min-h-7 w-full min-w-0 flex-1 text-left',
    columnsClassName,
  );
  if (!interactive) return <div className={className}>{children}</div>;
  return (
    // Left-click only (ruling D-F): a wormhole row without inline cells opens
    // the Signature Editor, and a catalogue-matched site opens the site
    // viewer. Unresolved rows identify from the Name combobox. The duplicate
    // right-click path is retired — the canvas owns right-click now.
    // No aria-label: it would replace descendant ID / name / Est. ISK. A
    // visually hidden action prefix keeps the verb while cells stay in the name.
    <Button
      variant="bare"
      className={className}
      onClick={(event) => openRowActionsAtStart(event.currentTarget, onOpenActions)}
    >
      <span className="sr-only">{rowActionPrefix(row, canEdit, resolveSiteId)} </span>
      {children}
    </Button>
  );
}

function SignatureRow({
  row,
  missing,
  canEdit,
  resolveSiteId,
  columnsClassName,
  cells,
  showOpenAffordance,
  onOpenActions,
}: SignatureRowProps) {
  const interactive = showOpenAffordance;
  return (
    <li
      data-signature-row
      data-signature-id={row.signatureId}
      data-signature-missing={missingDataAttribute(missing)}
      data-signature-row-open={showOpenAffordance ? true : undefined}
      className={cn(
        'group/sig-row relative isolate flex min-h-8 flex-col px-2.5 py-1 font-ui text-ui',
        signatureRowTone(missing),
        showOpenAffordance &&
          'cursor-pointer transition-[transform,font-size] duration-fast motion-reduce:transition-none hover:-translate-y-1 hover:text-nav has-[:focus-visible]:-translate-y-1 has-[:focus-visible]:text-nav',
      )}
    >
      <SignalFill signalPct={row.signalPct} />
      <SignatureRowContent
        row={row}
        interactive={interactive}
        canEdit={canEdit}
        resolveSiteId={resolveSiteId}
        onOpenActions={onOpenActions}
        columnsClassName={columnsClassName}
      >
        {cells}
      </SignatureRowContent>
    </li>
  );
}

function IdCell({
  row,
  now,
}: {
  readonly row: SignatureWindowRow;
  readonly now: number;
}) {
  return (
    <Tooltip content={`Age ${formatSignatureAge(row.firstSeenAt, now)}`}>
      <span className="whitespace-nowrap text-isk tabular-nums">
        {row.signatureId}
        <span className="sr-only">{` Age ${formatSignatureAge(row.firstSeenAt, now)}`}</span>
      </span>
    </Tooltip>
  );
}

function NameCell({ row }: { readonly row: SignatureWindowRow }) {
  const unresolved = row.name === null;
  return (
    <span
      className={cn(
        'truncate',
        unresolved ? 'font-normal text-muted' : 'font-medium text-name',
      )}
    >
      {signatureName(row)}
    </span>
  );
}

function SiteTypeCell({ row }: { readonly row: SignatureWindowRow }) {
  const label = scannerGroupTypeLabel(row.group);
  return (
    <span
      data-signature-site-type={label ?? undefined}
      className="truncate font-medium text-name"
    >
      {label ?? '—'}
    </span>
  );
}

interface WormholeCellContext {
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

function wormholeCells(
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

function sectionCells(
  sectionId: ScannerSectionId,
  row: SignatureWindowRow,
  ctx: WormholeCellContext,
): ReactNode {
  switch (sectionId) {
    case 'unknown':
      return (
        <>
          <IdCell row={row} now={ctx.now} />
          {ctx.canEdit && row.group === null && ctx.onIdentify !== undefined ? (
            <ScannerIdentifyCombo
              codes={ctx.codes}
              preferredCodes={ctx.preferredCodes}
              classLabelOf={ctx.classLabelOf}
              rowId={row.signatureId}
              disabled={false}
              onIdentify={(group, code) => ctx.onIdentify?.(row, group, code)}
            />
          ) : (
            <NameCell row={row} />
          )}
        </>
      );
    case 'wormholes':
      return wormholeCells(row, ctx);
    case 'combat':
      return (
        <>
          <IdCell row={row} now={ctx.now} />
          <NameCell row={row} />
          <ScannerEstIskCell siteName={row.name} live={false} />
        </>
      );
    case 'harvestables':
      return (
        <>
          <IdCell row={row} now={ctx.now} />
          <SiteTypeCell row={row} />
          <NameCell row={row} />
          <ScannerEstIskCell siteName={row.name} live />
        </>
      );
    case 'hacking':
      return (
        <>
          <IdCell row={row} now={ctx.now} />
          <SiteTypeCell row={row} />
          <NameCell row={row} />
        </>
      );
  }
}

function sectionHeaders(sectionId: ScannerSectionId): readonly string[] {
  switch (sectionId) {
    case 'unknown':
      return ['ID', 'Name'];
    case 'wormholes':
      return ['ID', 'Type', 'Mass', 'Life', 'Destination'];
    case 'combat':
      return ['ID', 'Name', 'Est. ISK'];
    case 'harvestables':
      return ['ID', 'Type', 'Name', 'Est. ISK'];
    case 'hacking':
      return ['ID', 'Type', 'Name'];
  }
}

function ColumnHeader({
  columnsClassName,
  labels,
}: {
  readonly columnsClassName: string;
  readonly labels: readonly string[];
}) {
  return (
    <div
      aria-hidden
      className={cn(
        columnsClassName,
        'px-2.5 font-ui text-label font-medium uppercase tracking-label text-muted',
      )}
    >
      {labels.map((label) => (
        <span key={label} className="w-full text-center">
          {label}
        </span>
      ))}
    </div>
  );
}

function ScannerSectionBlock({
  section,
  missingIds,
  canEdit,
  resolveSiteId,
  cells,
  onIdentify,
  onOpenActions,
}: {
  readonly section: ScannerSection;
  readonly missingIds: ReadonlySet<string>;
  readonly canEdit: boolean;
  readonly resolveSiteId: (name: string) => number | null;
  readonly cells: (row: SignatureWindowRow) => ReactNode;
  readonly onIdentify?: WormholeCellContext['onIdentify'];
  readonly onOpenActions: (
    row: SignatureWindowRow,
    trigger: HTMLElement,
    clientX: number,
    clientY: number,
  ) => void;
}) {
  const columnsClassName = SECTION_COLUMNS[section.id];
  return (
    <section
      data-scanner-section={section.id}
      className={cn(mapFrostedSurface, 'min-w-0 max-w-full')}
    >
      <Collapsible
        defaultOpen
        className="border-0"
        headerClassName="border-0 px-2.5 py-1.5 hover:bg-transparent"
        header={
          <span className="flex w-full items-center gap-2">
            <span
              data-chevron
              aria-hidden
              className="inline-block shrink-0 text-micro text-muted transition-transform"
            >
              ▾
            </span>
            <span className="font-ui text-label font-semibold uppercase tracking-label text-muted">
              {section.title}
            </span>
            <span
              data-scanner-section-count
              className="ml-auto rounded-ctl bg-bg-deep px-1.5 font-ui text-micro text-muted"
            >
              {section.rows.length}
            </span>
          </span>
        }
      >
        <div data-scanner-section-body className="flex flex-col pb-1">
          <ColumnHeader
            columnsClassName={columnsClassName}
            labels={sectionHeaders(section.id)}
          />
          <ul className="flex flex-col divide-y divide-border-soft">
            {section.rows.map((row) => {
              const inlineWormhole =
                section.id === 'wormholes' &&
                row.connection !== null &&
                canEdit;
              const inlineIdentify =
                section.id === 'unknown'
                && canEdit
                && row.group === null
                && onIdentify !== undefined;
              return (
                <SignatureRow
                  key={row.key}
                  row={row}
                  missing={missingIds.has(row.signatureId)}
                  canEdit={canEdit}
                  resolveSiteId={resolveSiteId}
                  columnsClassName={columnsClassName}
                  cells={cells(row)}
                  showOpenAffordance={
                    !inlineWormhole &&
                    !inlineIdentify &&
                    scannerRowShowsOpenAffordance(row, canEdit, resolveSiteId)
                  }
                  onOpenActions={(trigger, clientX, clientY) =>
                    onOpenActions(row, trigger, clientX, clientY)
                  }
                />
              );
            })}
          </ul>
        </div>
      </Collapsible>
    </section>
  );
}

function ScannerRowsLoading() {
  return (
    <p
      data-signature-empty
      className="px-3 py-4 text-center font-ui text-ui text-muted"
    >
      Reading scanner rows…
    </p>
  );
}

function ScannerSections({
  rows,
  scannerSystemId,
  missingIds,
  canEdit,
  resolveSiteId,
  complete,
  now,
  bindConnectionSetters,
  originLeadConnections,
  onIdentify,
  onOpenActions,
}: {
  readonly rows: readonly SignatureWindowRow[];
  readonly scannerSystemId: number | null;
  readonly missingIds: ReadonlySet<string>;
  readonly canEdit: boolean;
  readonly resolveSiteId: (name: string) => number | null;
  readonly complete: boolean;
  readonly now: number;
  readonly bindConnectionSetters?: WormholeCellContext['bindConnectionSetters'];
  readonly originLeadConnections: readonly OriginLeadConnection[];
  readonly onIdentify?: WormholeCellContext['onIdentify'];
  readonly onOpenActions: (
    row: SignatureWindowRow,
    trigger: HTMLElement,
    clientX: number,
    clientY: number,
  ) => void;
}) {
  const editorData = useWormholeEditorData(scannerSystemId ?? 0, null);
  const assets = useUniverseAssets();
  const classLabelOf = useCallback((code: string): string | null => {
    const entry = editorData.codex?.byCode(code) ?? null;
    if (entry === null || entry.farSide) return null;
    return systemClassText(entry.targetClass);
  }, [editorData.codex]);
  const ctx: WormholeCellContext = useMemo(() => {
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
  const sections = groupSignatureSections(rows, scannerSystemId);
  if (sections.length === 0) {
    return complete ? null : <ScannerRowsLoading />;
  }
  return (
    <div data-scanner-sections className="flex flex-col gap-2.5">
      {sections.map((section) => (
        <ScannerSectionBlock
          key={section.id}
          section={section}
          missingIds={missingIds}
          canEdit={canEdit}
          resolveSiteId={resolveSiteId}
          cells={(row) => sectionCells(section.id, row, ctx)}
          onIdentify={onIdentify}
          onOpenActions={onOpenActions}
        />
      ))}
    </div>
  );
}

export interface SignatureWindowProps {
  /** Map chain root — same system scope as the dock scanner summary. */
  readonly scannerSystemId: number | null;
  readonly rows: readonly SignatureWindowRow[];
  /** Row-highlight IDs, already scoped to the listed scanner system. */
  readonly missingIds: ReadonlySet<string>;
  /** Missing rows for the last paste-target system, which may differ from the listed one. */
  readonly missingCount: number;
  readonly canEdit: boolean;
  readonly complete: boolean;
  readonly now: number;
  readonly onDismissMissing: () => void;
  readonly onRemoveMissing: () => Promise<void>;
  /** Newest exact multi-survivor jump awaiting a signature pick. */
  readonly jumpResolution: JumpResolutionModel | null;
  readonly onPickJumpCandidate: (candidate: JumpResolutionCandidate) => void;
  readonly onIdentify: (
    row: SignatureWindowRow,
    group: SigGroup,
    wormholeTypeCode?: string,
  ) => Promise<void>;
  /** Opens the map's one Signature Editor on a wormhole row's connection. */
  readonly onOpenEditor: OpenSignatureEditor;
  /** Opens the read-only site viewer for a catalogue-matched site row. */
  readonly onOpenSite: (siteId: number, signatureId: string) => void;
  /** Binds inline wormhole cells to the existing connection-field setters. */
  readonly bindConnectionSetters?: (
    connection: ConnectionEditorDetail,
    side?: 'from' | 'to',
  ) => ConnectionFieldSetters;
  /** Resolved inbound lines the Destination cell can offer as a return pick. */
  readonly originLeadConnections?: readonly OriginLeadConnection[];
}

interface ScannerWindowFrameProps
  extends Pick<
    SignatureWindowProps,
    | 'scannerSystemId'
    | 'rows'
    | 'missingIds'
    | 'canEdit'
    | 'complete'
    | 'now'
    | 'bindConnectionSetters'
    | 'originLeadConnections'
    | 'onIdentify'
  > {
  readonly resolveSiteId: (name: string) => number | null;
  readonly onOpenActions: (
    row: SignatureWindowRow,
    trigger: HTMLElement,
    clientX: number,
    clientY: number,
  ) => void;
}

function missingPromptCopy(count: number): string {
  return count === 1
    ? '1 signature missing from scan'
    : `${count} signatures missing from scan`;
}

function MissingSignaturesPrompt({
  count,
  canEdit,
  onDismiss,
  onRemove,
}: {
  readonly count: number;
  readonly canEdit: boolean;
  readonly onDismiss: () => void;
  readonly onRemove: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      data-signature-missing-prompt
      className={cn(
        'flex flex-col gap-2 rounded-card p-3 text-ui',
        mapFrostedSurface,
      )}
    >
      <span className="font-data text-label uppercase tracking-label text-muted">
        Missing from scan
      </span>
      <p className="font-data text-micro text-name">{missingPromptCopy(count)}</p>
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
        {canEdit ? (
          <Button variant="danger" size="sm" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ScannerPasteHint() {
  return (
    <section
      data-scanner-paste-hint
      className={cn(mapFrostedSurface, 'min-w-0 max-w-full')}
    >
      <h3 className="px-2.5 py-1.5 text-center font-ui text-label font-semibold text-isk">
        Paste signatures anywhere on the page.
      </h3>
    </section>
  );
}

function ScannerListScroller({
  children,
}: {
  readonly children: ReactNode;
}) {
  const bump = useScannerScrollBump();
  const observerRef = useRef<ResizeObserver | null>(null);
  const [fading, setFading] = useState(false);
  const [canScrollEnd, setCanScrollEnd] = useState(false);
  const measure = useCallback((el: HTMLDivElement) => {
    const nextFade = el.scrollTop > 0;
    const nextCanScrollEnd =
      el.scrollTop + el.clientHeight < el.scrollHeight - 1;
    setFading((current) => (current === nextFade ? current : nextFade));
    setCanScrollEnd((current) =>
      current === nextCanScrollEnd ? current : nextCanScrollEnd,
    );
  }, []);
  const setScrollNode = useCallback(
    (el: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (el === null) return;
      const update = () => measure(el);
      update();
      const observer = new ResizeObserver(update);
      observer.observe(el);
      const inner = el.firstElementChild;
      if (inner !== null) observer.observe(inner);
      observerRef.current = observer;
    },
    [measure],
  );
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    bump();
    measure(event.currentTarget);
  };
  return (
    <div className="relative flex min-h-0 flex-auto flex-col">
      <div
        ref={setScrollNode}
        data-scanner-scroll
        onScroll={onScroll}
        className={cn(
          scrollAreaStart,
          'min-h-0 min-w-0 max-w-full flex-auto overflow-y-auto overscroll-contain',
          canScrollEnd && 'scanner-scroll-fade-end',
          fading && 'scanner-scroll-fade-start',
        )}
      >
        <div className="min-w-0 w-full max-w-full">{children}</div>
      </div>
      <div
        aria-hidden
        data-scanner-scroll-frost="start"
        className={cn(
          'scanner-scroll-frost scanner-scroll-frost-start',
          fading && 'is-active',
        )}
      />
      <div
        aria-hidden
        data-scanner-scroll-frost="end"
        className={cn(
          'scanner-scroll-frost scanner-scroll-frost-end',
          canScrollEnd && 'is-active',
        )}
      />
    </div>
  );
}

function ScannerWindowFrame(props: ScannerWindowFrameProps) {
  const filled =
    groupSignatureSections(props.rows, props.scannerSystemId).length > 0;
  const listOpen = filled || !props.complete;
  return (
    <ScannerScrollEpochProvider>
      <MapWindow
        windowId="signatures"
        title="Signatures · Anomalies"
        placement={{ kind: 'docked-bottom-left' }}
        stackIndex={1}
        showHeader
        showCloseButton={false}
        onClose={() => undefined}
        onActivate={() => undefined}
      >
        <div
          data-signature-window
          data-scanner-filled={filled ? 'true' : 'false'}
          className="flex min-h-0 min-w-0 flex-auto flex-col px-2 pb-1.5 pt-1"
        >
          {!filled && props.complete && props.canEdit ? (
            <ScannerPasteHint />
          ) : null}
          {listOpen ? (
            <ScannerListScroller>
              <ScannerSections
                rows={props.rows}
                scannerSystemId={props.scannerSystemId}
                missingIds={props.missingIds}
                canEdit={props.canEdit}
                resolveSiteId={props.resolveSiteId}
                complete={props.complete}
                now={props.now}
                bindConnectionSetters={props.bindConnectionSetters}
                originLeadConnections={props.originLeadConnections ?? []}
                onIdentify={props.onIdentify}
                onOpenActions={props.onOpenActions}
              />
            </ScannerListScroller>
          ) : null}
        </div>
      </MapWindow>
    </ScannerScrollEpochProvider>
  );
}

/** Named harvestable rows in the listed scanner system (live Est. ISK scope). */
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

/** Permanent bottom-left scanner window composed beside the managed map stack. */
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
          {props.missingCount > 0
          || (props.canEdit && props.jumpResolution !== null) ? (
            <div
              data-scanner-prompt-rail
              className={MAP_SCANNER_PROMPT_RAIL_CLASS}
            >
              <MissingSignaturesPrompt
                count={props.missingCount}
                canEdit={props.canEdit}
                onDismiss={props.onDismissMissing}
                onRemove={removeMissing}
              />
              {props.canEdit && props.jumpResolution !== null ? (
                <SignatureJumpPrompt
                  resolution={props.jumpResolution}
                  onPick={props.onPickJumpCandidate}
                />
              ) : null}
            </div>
          ) : null}
          <ScannerWindowFrame
            {...props}
            resolveSiteId={resolveSiteId}
            onIdentify={identifyRow}
            onOpenActions={openRowActions}
          />
        </div>
      </div>
    </ScannerLivePricesProvider>
  );
}

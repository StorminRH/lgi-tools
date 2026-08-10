'use client';

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
  type ReactNode,
} from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Collapsible } from '@/components/ui/collapsible';
import {
  MenuItem,
  menuRow,
  PointerMenu,
  pointerAnchor,
} from '@/components/ui/pointer-menu';
import { scrollArea } from '@/components/ui/scroll-area';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import { SIG_GROUPS, type SigGroup } from '@/data/maps/scan-parse';
import type { ConnectionAuthoringApi } from '../authoring/ConnectionAuthoringOverlay';
import { useWormholeCodexData } from '../authoring/use-wormhole-editor-data';
import { mapFrostedSurface } from '../map-frosted-surface';
import {
  MAP_SCANNER_MISSING_PROMPT_CLASS,
  MapWindow,
} from '../windows/MapWindow';
import {
  filterSignatureRows,
  formatSignatureAge,
  groupSignatureSections,
  scannerWormholeLifetime,
  scannerWormholeSize,
  type ScannerSection,
  type ScannerSectionId,
  type SignatureWindowRow,
} from './signature-model';
import { WormholeRowEditor } from './WormholeRowEditor';

interface RowActionAnchor {
  readonly row: SignatureWindowRow;
  readonly clientX: number;
  readonly clientY: number;
  readonly kind: 'identify' | 'edit';
}

type OpenRowActions = (
  trigger: HTMLElement,
  clientX: number,
  clientY: number,
) => void;

function openRowActionsAtStart(
  trigger: HTMLElement,
  onOpenActions: OpenRowActions,
): void {
  const bounds = trigger.getBoundingClientRect();
  onOpenActions(trigger, bounds.left + 12, bounds.top + 12);
}

function handleRowContextMenu(
  event: MouseEvent<HTMLButtonElement>,
  onOpenActions: OpenRowActions,
): void {
  event.preventDefault();
  onOpenActions(event.currentTarget, event.clientX, event.clientY);
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
  readonly columnsClassName: string;
  readonly cells: ReactNode;
  readonly showOpenAffordance: boolean;
  readonly onOpenActions: OpenRowActions;
}

function rowIsEditable(row: SignatureWindowRow, canEdit: boolean): boolean {
  if (!canEdit) return false;
  return row.connection !== null || row.group === null;
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

function rowActionLabel(row: SignatureWindowRow): string {
  return row.connection === null
    ? `Identify signature ${row.signatureId}`
    : `Edit wormhole ${row.signatureId}`;
}

const SECTION_COLUMNS: Readonly<Record<ScannerSectionId, string>> = {
  unknown: 'grid w-full grid-cols-[3.75rem_minmax(0,1fr)_2.25rem] items-center gap-2',
  wormholes:
    'grid w-full grid-cols-[3.75rem_minmax(0,1fr)_2rem_minmax(4.5rem,auto)_2.25rem] items-center gap-2',
  combat: 'grid w-full grid-cols-[3.75rem_minmax(0,1fr)_4.75rem] items-center gap-2',
  harvestables: 'grid w-full grid-cols-[3.75rem_minmax(0,1fr)_4.75rem] items-center gap-2',
  hacking: 'grid w-full grid-cols-[3.75rem_minmax(0,1fr)] items-center gap-2',
};

const ANOMALY_COLUMNS =
  'grid w-full grid-cols-[3.75rem_minmax(0,1fr)_2.25rem] items-center gap-2';

function SignatureRowContent({
  row,
  editable,
  onOpenActions,
  columnsClassName,
  children,
}: {
  readonly row: SignatureWindowRow;
  readonly editable: boolean;
  readonly onOpenActions: OpenRowActions;
  readonly columnsClassName: string;
  readonly children: ReactNode;
}) {
  const className = cn(
    'relative z-base min-h-7 w-full flex-1 text-left',
    columnsClassName,
  );
  if (!editable) return <div className={className}>{children}</div>;
  return (
    <Button
      variant="bare"
      aria-label={rowActionLabel(row)}
      className={className}
      onClick={(event) => openRowActionsAtStart(event.currentTarget, onOpenActions)}
      onContextMenu={(event) => handleRowContextMenu(event, onOpenActions)}
    >
      {children}
    </Button>
  );
}

function SignatureRow({
  row,
  missing,
  canEdit,
  columnsClassName,
  cells,
  showOpenAffordance,
  onOpenActions,
}: SignatureRowProps) {
  const editable = rowIsEditable(row, canEdit);
  return (
    <li
      data-signature-row
      data-signature-id={row.signatureId}
      data-signature-missing={missingDataAttribute(missing)}
      className={cn(
        'group/sig-row relative isolate flex min-h-9 flex-col overflow-hidden rounded-ctl px-2 py-1 font-data text-micro transition-colors hover:bg-row-hover',
        signatureRowTone(missing),
      )}
    >
      <SignalFill signalPct={row.signalPct} />
      <SignatureRowContent
        row={row}
        editable={editable}
        onOpenActions={onOpenActions}
        columnsClassName={columnsClassName}
      >
        {cells}
      </SignatureRowContent>
      {showOpenAffordance ? (
        <span
          data-signature-row-open
          aria-hidden
          className="pointer-events-none absolute right-1.5 top-1/2 z-base -translate-y-1/2 font-ui text-nav font-semibold text-name opacity-0 transition-opacity duration-fast motion-reduce:transition-none group-hover/sig-row:opacity-100 group-has-[:focus-visible]/sig-row:opacity-100"
        >
          &gt;
        </span>
      ) : null}
    </li>
  );
}

function IdCell({ row }: { readonly row: SignatureWindowRow }) {
  return <span className="text-center text-isk tabular-nums">{row.signatureId}</span>;
}

function NameCell({ row }: { readonly row: SignatureWindowRow }) {
  return <span className="truncate text-name">{signatureName(row)}</span>;
}

function AgeCell({
  row,
  now,
}: {
  readonly row: SignatureWindowRow;
  readonly now: number;
}) {
  return (
    <span className="text-center text-muted tabular-nums">
      {formatSignatureAge(row.firstSeenAt, now)}
    </span>
  );
}

function BlankIskCell() {
  return (
    <span data-signature-isk-placeholder className="text-right text-muted tabular-nums">
      —
    </span>
  );
}

function sectionCells(
  sectionId: ScannerSectionId,
  row: SignatureWindowRow,
  now: number,
  entry: WormholeCodexEntry | null,
): ReactNode {
  switch (sectionId) {
    case 'unknown':
      return (
        <>
          <IdCell row={row} />
          <NameCell row={row} />
          <AgeCell row={row} now={now} />
        </>
      );
    case 'wormholes':
      return (
        <>
          <IdCell row={row} />
          <NameCell row={row} />
          <span className="text-center text-muted tabular-nums">
            {scannerWormholeSize(row.connection, entry)}
          </span>
          <span className="truncate text-center text-muted">
            {scannerWormholeLifetime(row.connection, entry, now)}
          </span>
          <AgeCell row={row} now={now} />
        </>
      );
    case 'combat':
    case 'harvestables':
      return (
        <>
          <IdCell row={row} />
          <NameCell row={row} />
          <BlankIskCell />
        </>
      );
    case 'hacking':
      return (
        <>
          <IdCell row={row} />
          <NameCell row={row} />
        </>
      );
  }
}

function sectionHeaders(sectionId: ScannerSectionId): readonly string[] {
  switch (sectionId) {
    case 'unknown':
      return ['ID', 'Name', 'Age'];
    case 'wormholes':
      return ['ID', 'Name', 'Size', 'Lifetime', 'Age'];
    case 'combat':
    case 'harvestables':
      return ['ID', 'Name', 'Est. ISK'];
    case 'hacking':
      return ['ID', 'Name'];
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
        'px-2 font-data text-label uppercase tracking-label text-muted',
      )}
    >
      {labels.map((label) => (
        <span
          key={label}
          className={label === 'Est. ISK' || label === 'Name' ? 'text-left' : 'text-center'}
        >
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
  now,
  resolveEntry,
  onOpenActions,
}: {
  readonly section: ScannerSection;
  readonly missingIds: ReadonlySet<string>;
  readonly canEdit: boolean;
  readonly now: number;
  readonly resolveEntry: (code: string | null) => WormholeCodexEntry | null;
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
      className="border-b border-border-soft last:border-b-0"
    >
      <Collapsible
        defaultOpen
        className="border-0"
        headerClassName="justify-center border-b border-border-soft px-2 py-1"
        header={
          <span className="relative flex w-full items-center justify-center">
            <span className="font-data text-label uppercase tracking-label text-name">
              {section.title}
            </span>
            <span
              data-chevron
              aria-hidden
              className="absolute right-0 inline-block shrink-0 text-micro text-muted transition-transform"
            >
              ▾
            </span>
          </span>
        }
      >
        <div
          data-scanner-section-body
          className="flex flex-col gap-1.5 border-l border-border-soft py-1 pl-2"
        >
          <ColumnHeader
            columnsClassName={columnsClassName}
            labels={sectionHeaders(section.id)}
          />
          <ul className="flex flex-col gap-1">
            {section.rows.map((row) => {
              const entry = resolveEntry(row.connection?.wormholeTypeCode ?? null);
              return (
                <SignatureRow
                  key={row.key}
                  row={row}
                  missing={missingIds.has(row.signatureId)}
                  canEdit={canEdit}
                  columnsClassName={columnsClassName}
                  cells={sectionCells(section.id, row, now, entry)}
                  showOpenAffordance={row.connection !== null}
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

function SignaturesTabBody({
  rows,
  scannerSystemId,
  missingIds,
  canEdit,
  complete,
  now,
  onOpenActions,
}: {
  readonly rows: readonly SignatureWindowRow[];
  readonly scannerSystemId: number | null;
  readonly missingIds: ReadonlySet<string>;
  readonly canEdit: boolean;
  readonly complete: boolean;
  readonly now: number;
  readonly onOpenActions: (
    row: SignatureWindowRow,
    trigger: HTMLElement,
    clientX: number,
    clientY: number,
  ) => void;
}) {
  const { codex } = useWormholeCodexData(null);
  const resolveEntry = (code: string | null): WormholeCodexEntry | null =>
    code === null || codex === null ? null : codex.byCode(code);
  const sections = groupSignatureSections(rows, scannerSystemId);
  if (sections.length === 0) {
    return (
      <p
        data-signature-empty
        className="rounded-ctl border border-border-soft px-3 py-4 text-center font-data text-micro text-muted"
      >
        {complete ? 'No scanner rows in this system.' : 'Reading scanner rows…'}
      </p>
    );
  }
  return (
    <div data-scanner-sections className="flex flex-col">
      {sections.map((section) => (
        <ScannerSectionBlock
          key={section.id}
          section={section}
          missingIds={missingIds}
          canEdit={canEdit}
          now={now}
          resolveEntry={resolveEntry}
          onOpenActions={onOpenActions}
        />
      ))}
    </div>
  );
}

function AnomalyTable({
  rows,
  missingIds,
  canEdit,
  complete,
  now,
  onOpenActions,
}: {
  readonly rows: readonly SignatureWindowRow[];
  readonly missingIds: ReadonlySet<string>;
  readonly canEdit: boolean;
  readonly complete: boolean;
  readonly now: number;
  readonly onOpenActions: (
    row: SignatureWindowRow,
    trigger: HTMLElement,
    clientX: number,
    clientY: number,
  ) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <ColumnHeader columnsClassName={ANOMALY_COLUMNS} labels={['ID', 'Name', 'Age']} />
      {rows.length === 0 ? (
        <p
          data-signature-empty
          className="rounded-ctl border border-border-soft px-3 py-4 text-center font-data text-micro text-muted"
        >
          {complete ? 'No scanner rows in this system.' : 'Reading scanner rows…'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((row) => (
            <SignatureRow
              key={row.key}
              row={row}
              missing={missingIds.has(row.signatureId)}
              canEdit={canEdit}
              columnsClassName={ANOMALY_COLUMNS}
              cells={
                <>
                  <IdCell row={row} />
                  <NameCell row={row} />
                  <AgeCell row={row} now={now} />
                </>
              }
              showOpenAffordance={false}
              onOpenActions={(trigger, clientX, clientY) =>
                onOpenActions(row, trigger, clientX, clientY)
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface SignatureWindowProps {
  /** Map chain root — same system scope as the dock scanner summary. */
  readonly scannerSystemId: number | null;
  readonly rows: readonly SignatureWindowRow[];
  readonly missingIds: ReadonlySet<string>;
  readonly canEdit: boolean;
  readonly complete: boolean;
  readonly now: number;
  readonly onDismissMissing: () => void;
  readonly onRemoveMissing: () => Promise<void>;
  readonly onIdentify: (
    row: SignatureWindowRow,
    group: SigGroup,
  ) => Promise<void>;
  readonly mapId: string;
  readonly authoring: ConnectionAuthoringApi;
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
  > {
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
        MAP_SCANNER_MISSING_PROMPT_CLASS,
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

function ScannerWindowFrame(props: ScannerWindowFrameProps) {
  return (
    <MapWindow
      windowId="signatures"
      title="Scanner"
      placement={{ kind: 'docked-bottom-left' }}
      stackIndex={1}
      showHeader={false}
      showCloseButton={false}
      onClose={() => undefined}
      onActivate={() => undefined}
    >
      <div
        data-signature-window
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs
          label="Scanner row kinds"
          defaultValue="signature"
          className="flex min-h-0 flex-1 flex-col"
          listClassName="w-full shrink-0 gap-0"
          tabClassName="flex flex-1 justify-center px-2 text-center"
          panelClassName={cn(
            scrollArea,
            'min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 pt-2',
          )}
          tabs={[
            {
              value: 'signature',
              label: 'Signatures',
              content: (
                <SignaturesTabBody
                  rows={props.rows}
                  scannerSystemId={props.scannerSystemId}
                  missingIds={props.missingIds}
                  canEdit={props.canEdit}
                  complete={props.complete}
                  now={props.now}
                  onOpenActions={props.onOpenActions}
                />
              ),
            },
            {
              value: 'anomaly',
              label: 'Anomalies',
              content: (
                <AnomalyTable
                  rows={filterSignatureRows(
                    props.rows,
                    props.scannerSystemId,
                    'anomaly',
                  )}
                  missingIds={props.missingIds}
                  canEdit={props.canEdit}
                  complete={props.complete}
                  now={props.now}
                  onOpenActions={props.onOpenActions}
                />
              ),
            },
          ]}
        />
      </div>
    </MapWindow>
  );
}

function IdentifySignatureMenu({
  action,
  finalFocus,
  onIdentify,
  onClose,
}: {
  readonly action: RowActionAnchor | null;
  readonly finalFocus: RefObject<HTMLElement | null>;
  readonly onIdentify: SignatureWindowProps['onIdentify'];
  readonly onClose: () => void;
}) {
  const identifying = action?.kind === 'identify' ? action : null;
  const identify = (group: SigGroup) => {
    if (identifying === null) return;
    const row = identifying.row;
    onClose();
    void onIdentify(row, group).catch(() => {
      toast.error('The signature could not be identified.', {
        id: `signature-identify:${row.systemId}:${row.signatureId}`,
      });
    });
  };
  return (
    <PointerMenu
      open={identifying !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      anchor={
        identifying === null
          ? null
          : pointerAnchor(identifying.clientX, identifying.clientY)
      }
      label="Identify signature as"
      className="min-w-40"
      finalFocus={finalFocus}
    >
      {SIG_GROUPS.map((group) => (
        <MenuItem
          key={group}
          className={menuRow}
          onClick={() => identify(group)}
        >
          {group}
        </MenuItem>
      ))}
    </PointerMenu>
  );
}

function ActiveWormholeRowEditor({
  action,
  mapId,
  authoring,
  finalFocus,
  now,
  onClose,
}: {
  readonly action: RowActionAnchor | null;
  readonly mapId: string;
  readonly authoring: ConnectionAuthoringApi;
  readonly finalFocus: RefObject<HTMLElement | null>;
  readonly now: number;
  readonly onClose: () => void;
}) {
  if (action?.kind !== 'edit' || action.row.connection === null) return null;
  return (
    <WormholeRowEditor
      mapId={mapId}
      connection={action.row.connection}
      authoring={authoring}
      anchor={{ clientX: action.clientX, clientY: action.clientY, finalFocus }}
      now={now}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    />
  );
}

/** Permanent bottom-left scanner window composed beside the managed map stack. */
export function SignatureWindow(props: SignatureWindowProps) {
  const rowActionFocus = useRef<HTMLElement | null>(null);
  const [rowAction, setRowAction] = useState<RowActionAnchor | null>(null);
  const closeRowAction = () => setRowAction(null);
  const removeMissing = () => {
    void props.onRemoveMissing().catch(() => {
      toast.error('The signatures could not be removed. Try again.', {
        id: 'signature-remove:batch',
      });
    });
  };
  const openRowActions = (
    row: SignatureWindowRow,
    trigger: HTMLElement,
    clientX: number,
    clientY: number,
  ) => {
    rowActionFocus.current = trigger;
    setRowAction({
      row,
      clientX,
      clientY,
      kind: row.connection === null ? 'identify' : 'edit',
    });
  };

  return (
    <div
      data-signature-window-layer
      className="pointer-events-none absolute inset-0 z-sticky"
    >
      <MissingSignaturesPrompt
        count={props.missingIds.size}
        canEdit={props.canEdit}
        onDismiss={props.onDismissMissing}
        onRemove={removeMissing}
      />
      <ScannerWindowFrame {...props} onOpenActions={openRowActions} />
      <IdentifySignatureMenu
        action={rowAction}
        finalFocus={rowActionFocus}
        onIdentify={props.onIdentify}
        onClose={closeRowAction}
      />
      <ActiveWormholeRowEditor
        action={rowAction}
        mapId={props.mapId}
        authoring={props.authoring}
        finalFocus={rowActionFocus}
        now={props.now}
        onClose={closeRowAction}
      />
    </div>
  );
}

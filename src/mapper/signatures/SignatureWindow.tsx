'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
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
} from '@/components/ui/pointer-menu';
import { pointerAnchor } from '@/components/ui/overlay-positioning';
import { scrollArea } from '@/components/ui/scroll-area';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import { SIG_GROUPS, type SigGroup } from '@/data/maps/scan-parse';
import {
  ScannerEstIskCell,
  ScannerLivePricesProvider,
} from '@/features/wormhole-sites/widget';
import { useWormholeCodexData } from '../authoring/use-wormhole-editor-data';
import { mapFrostedSurface } from '../map-frosted-surface';
import {
  MAP_SCANNER_PROMPT_RAIL_CLASS,
  MapWindow,
} from '../windows/MapWindow';
import { SignatureJumpPrompt } from './SignatureJumpPrompt';
import type {
  JumpResolutionCandidate,
  JumpResolutionModel,
} from './jump-resolution';
import {
  filterSignatureRows,
  formatSignatureAge,
  groupSignatureSections,
  scannerSectionForGroup,
  scannerWormholeLifetime,
  scannerWormholeSize,
  type ScannerSection,
  type ScannerSectionId,
  type SignatureWindowRow,
} from './signature-model';
import type { OpenSignatureEditor } from './signature-context';
import {
  applyScannerRowOpenAction,
  scannerRowOpenAction,
  scannerRowShowsOpenAffordance,
} from './scanner-row-open';

/** One unresolved row's pending group-identification menu. */
interface RowActionAnchor {
  readonly row: SignatureWindowRow;
  readonly clientX: number;
  readonly clientY: number;
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

function missingDataAttribute(missing: boolean): true | undefined {
  return missing ? true : undefined;
}

function signatureRowTone(missing: boolean): string {
  return missing ? 'map-signature-missing' : 'text-text';
}

function signatureName(row: SignatureWindowRow): string {
  return row.name ?? 'Unresolved';
}

function rowActionLabel(
  row: SignatureWindowRow,
  canEdit: boolean,
): string {
  const action = scannerRowOpenAction(row, canEdit);
  if (action?.kind === 'connection') {
    return `Edit wormhole ${row.signatureId}`;
  }
  if (action?.kind === 'site') {
    return `View site ${row.name ?? row.signatureId}`;
  }
  return `Identify signature ${row.signatureId}`;
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
  interactive,
  canEdit,
  onOpenActions,
  columnsClassName,
  children,
}: {
  readonly row: SignatureWindowRow;
  readonly interactive: boolean;
  readonly canEdit: boolean;
  readonly onOpenActions: OpenRowActions;
  readonly columnsClassName: string;
  readonly children: ReactNode;
}) {
  const className = cn(
    'relative z-base min-h-7 w-full flex-1 text-left',
    columnsClassName,
  );
  if (!interactive) return <div className={className}>{children}</div>;
  return (
    // Left-click only (ruling D-F): a wormhole row opens the Signature Editor,
    // a catalogue-matched site opens the site viewer, and an unresolved row
    // opens the identification menu. The duplicate right-click path is
    // retired — the canvas owns right-click now.
    <Button
      variant="bare"
      aria-label={rowActionLabel(row, canEdit)}
      className={className}
      onClick={(event) => openRowActionsAtStart(event.currentTarget, onOpenActions)}
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
  const interactive = showOpenAffordance;
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
        interactive={interactive}
        canEdit={canEdit}
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
          {/* Typed code plus its codex-derived destination class — the class
              label rode the retired Group column and must stay on the row. */}
          <span className="flex min-w-0 items-baseline gap-1.5">
            <NameCell row={row} />
            {row.className !== null ? (
              <span
                data-signature-class
                className="shrink-0 font-data text-micro uppercase tracking-label text-muted"
              >
                {row.className}
              </span>
            ) : null}
          </span>
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
      return (
        <>
          <IdCell row={row} />
          <NameCell row={row} />
          <ScannerEstIskCell siteName={row.name} live={false} />
        </>
      );
    case 'harvestables':
      return (
        <>
          <IdCell row={row} />
          <NameCell row={row} />
          <ScannerEstIskCell siteName={row.name} live />
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
                  showOpenAffordance={scannerRowShowsOpenAffordance(
                    row,
                    canEdit,
                  )}
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
              showOpenAffordance={scannerRowShowsOpenAffordance(
                row,
                canEdit,
              )}
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
  ) => Promise<void>;
  /** Opens the map's one Signature Editor on a wormhole row's connection. */
  readonly onOpenEditor: OpenSignatureEditor;
  /** Opens the read-only site viewer for a catalogue-matched site row. */
  readonly onOpenSite: (siteId: number, signatureId: string) => void;
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
  const identifying = action;
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
      <p
        data-signature-identify-note
        className="px-2 pb-1 pt-0.5 font-data text-micro text-muted"
      >
        Identification is permanent
      </p>
    </PointerMenu>
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
  const rowActionFocus = useRef<HTMLElement | null>(null);
  const [rowAction, setRowAction] = useState<RowActionAnchor | null>(null);
  const harvestableNames = useMemo(
    () => harvestableNamesForScanner(props.rows, props.scannerSystemId),
    [props.rows, props.scannerSystemId],
  );
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
    applyScannerRowOpenAction(
      scannerRowOpenAction(row, props.canEdit),
      {
        openEditor: props.onOpenEditor,
        openSite: props.onOpenSite,
        openIdentify: (identifyRow, identifyTrigger, x, y) => {
          rowActionFocus.current = identifyTrigger;
          setRowAction({ row: identifyRow, clientX: x, clientY: y });
        },
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
        <div data-scanner-prompt-rail className={MAP_SCANNER_PROMPT_RAIL_CLASS}>
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
        <ScannerWindowFrame {...props} onOpenActions={openRowActions} />
        <IdentifySignatureMenu
          action={rowAction}
          finalFocus={rowActionFocus}
          onIdentify={props.onIdentify}
          onClose={closeRowAction}
        />
      </div>
    </ScannerLivePricesProvider>
  );
}

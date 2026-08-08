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
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  MenuItem,
  menuRow,
  PointerMenu,
  pointerAnchor,
} from '@/components/ui/pointer-menu';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import {
  SIG_GROUPS,
  type ScannedKind,
  type SigGroup,
} from '@/data/maps/scan-parse';
import type { ConnectionAuthoringApi } from '../authoring/ConnectionAuthoringOverlay';
import { MapWindow } from '../windows/MapWindow';
import {
  filterSignatureRows,
  formatSignatureAge,
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
  readonly now: number;
  readonly onDismiss: () => void;
  readonly onRequestRemove: (trigger: HTMLButtonElement) => void;
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

function signatureGroup(row: SignatureWindowRow): string {
  return row.className ?? row.group ?? 'Unknown';
}

function rowActionLabel(row: SignatureWindowRow): string {
  return row.connection === null
    ? `Identify signature ${row.signatureId}`
    : `Edit wormhole ${row.signatureId}`;
}

const SIGNATURE_ROW_COLS =
  'grid w-full grid-cols-[3.75rem_5.75rem_minmax(0,1fr)_2.25rem] items-center gap-2';

function SignatureRowContent({
  row,
  editable,
  onOpenActions,
  children,
}: {
  readonly row: SignatureWindowRow;
  readonly editable: boolean;
  readonly onOpenActions: OpenRowActions;
  readonly children: ReactNode;
}) {
  const className = cn('relative z-base text-left', SIGNATURE_ROW_COLS);
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

function MissingSignatureActions({
  canEdit,
  onDismiss,
  onRequestRemove,
}: Pick<SignatureRowProps, 'canEdit' | 'onDismiss' | 'onRequestRemove'>) {
  return (
    <div className="map-signature-missing-actions relative z-base col-span-4 flex justify-end gap-1 border-t pt-1">
      <Button
        variant="bare"
        className="px-2.5 py-[5px] text-nav text-muted hover:text-name"
        onClick={onDismiss}
      >
        Dismiss
      </Button>
      {canEdit ? (
        <Button
          variant="danger"
          size="sm"
          onClick={(event) => onRequestRemove(event.currentTarget)}
        >
          Remove
        </Button>
      ) : null}
    </div>
  );
}

function OptionalMissingSignatureActions({
  missing,
  canEdit,
  onDismiss,
  onRequestRemove,
}: Pick<
  SignatureRowProps,
  'missing' | 'canEdit' | 'onDismiss' | 'onRequestRemove'
>) {
  if (!missing) return null;
  return (
    <MissingSignatureActions
      canEdit={canEdit}
      onDismiss={onDismiss}
      onRequestRemove={onRequestRemove}
    />
  );
}

function SignatureRow({
  row,
  missing,
  canEdit,
  now,
  onDismiss,
  onRequestRemove,
  onOpenActions,
}: SignatureRowProps) {
  const editable = rowIsEditable(row, canEdit);
  return (
    <li
      data-signature-row
      data-signature-id={row.signatureId}
      data-signature-missing={missingDataAttribute(missing)}
      className={cn(
        'relative isolate min-h-9 overflow-hidden rounded-ctl px-2 py-1 font-data text-micro',
        signatureRowTone(missing),
      )}
    >
      <SignalFill signalPct={row.signalPct} />
      <SignatureRowContent
        row={row}
        editable={editable}
        onOpenActions={onOpenActions}
      >
        <span className="text-center text-isk tabular-nums">{row.signatureId}</span>
        <span className="truncate text-muted">{signatureGroup(row)}</span>
        <span className="truncate text-name">{signatureName(row)}</span>
        <span className="text-center text-muted tabular-nums">
          {formatSignatureAge(row.firstSeenAt, now)}
        </span>
      </SignatureRowContent>
      <OptionalMissingSignatureActions
        missing={missing}
        canEdit={canEdit}
        onDismiss={onDismiss}
        onRequestRemove={onRequestRemove}
      />
    </li>
  );
}

function SignatureTable({
  rows,
  missingIds,
  canEdit,
  complete,
  now,
  onDismiss,
  onRequestRemove,
  onOpenActions,
}: {
  readonly rows: readonly SignatureWindowRow[];
  readonly missingIds: ReadonlySet<string>;
  readonly canEdit: boolean;
  readonly complete: boolean;
  readonly now: number;
  readonly onDismiss: (signatureId: string) => void;
  readonly onRequestRemove: (
    row: SignatureWindowRow,
    trigger: HTMLButtonElement,
  ) => void;
  readonly onOpenActions: (
    row: SignatureWindowRow,
    trigger: HTMLElement,
    clientX: number,
    clientY: number,
  ) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        aria-hidden
        className={cn(
          SIGNATURE_ROW_COLS,
          'px-2 font-ui text-label uppercase tracking-label text-muted',
        )}
      >
        <span className="text-center">ID</span>
        <span className="text-center">Group</span>
        <span className="text-center">Name</span>
        <span className="text-center">Age</span>
      </div>
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
              now={now}
              onDismiss={() => onDismiss(row.signatureId)}
              onRequestRemove={(trigger) => onRequestRemove(row, trigger)}
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
  readonly activeSystemId: number | null;
  readonly rows: readonly SignatureWindowRow[];
  readonly missingIds: ReadonlySet<string>;
  readonly canEdit: boolean;
  readonly complete: boolean;
  readonly now: number;
  readonly onDismissMissing: (signatureId: string) => void;
  readonly onRemove: (row: SignatureWindowRow) => Promise<void>;
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
    | 'activeSystemId'
    | 'rows'
    | 'missingIds'
    | 'canEdit'
    | 'complete'
    | 'now'
    | 'onDismissMissing'
  > {
  readonly onRequestRemove: (
    row: SignatureWindowRow,
    trigger: HTMLButtonElement,
  ) => void;
  readonly onOpenActions: (
    row: SignatureWindowRow,
    trigger: HTMLElement,
    clientX: number,
    clientY: number,
  ) => void;
}

function tableForKind(kind: ScannedKind, props: ScannerWindowFrameProps) {
  return (
    <SignatureTable
      rows={filterSignatureRows(props.rows, props.activeSystemId, kind)}
      missingIds={props.missingIds}
      canEdit={props.canEdit}
      complete={props.complete}
      now={props.now}
      onDismiss={props.onDismissMissing}
      onRequestRemove={props.onRequestRemove}
      onOpenActions={props.onOpenActions}
    />
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
          panelClassName="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2 pt-2"
          tabs={[
            {
              value: 'signature',
              label: 'Signatures',
              content: tableForKind('signature', props),
            },
            {
              value: 'anomaly',
              label: 'Anomalies',
              content: tableForKind('anomaly', props),
            },
          ]}
        />
      </div>
    </MapWindow>
  );
}

function SignatureRemovalDialog({
  pending,
  busy,
  error,
  finalFocus,
  onRemove,
  onPendingChange,
  onBusyChange,
  onErrorChange,
}: {
  readonly pending: SignatureWindowRow | null;
  readonly busy: boolean;
  readonly error: string | null;
  readonly finalFocus: RefObject<HTMLElement | null>;
  readonly onRemove: SignatureWindowProps['onRemove'];
  readonly onPendingChange: (row: SignatureWindowRow | null) => void;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onErrorChange: (error: string | null) => void;
}) {
  const confirm = () => {
    if (pending === null) return;
    onBusyChange(true);
    onErrorChange(null);
    void onRemove(pending)
      .then(
        () => onPendingChange(null),
        () => onErrorChange('The signature could not be removed. Try again.'),
      )
      .finally(() => onBusyChange(false));
  };
  return (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) onPendingChange(null);
      }}
      title={`Remove ${pending?.signatureId ?? 'signature'}?`}
      consequence="This row will disappear from the map for 24 hours unless you undo it."
      busy={busy}
      error={error}
      confirmLabel="Remove"
      busyLabel="Removing…"
      onConfirm={confirm}
      finalFocus={finalFocus}
    />
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
  const [pending, setPending] = useState<SignatureWindowRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finalFocus = useRef<HTMLElement | null>(null);
  const rowActionFocus = useRef<HTMLElement | null>(null);
  const [rowAction, setRowAction] = useState<RowActionAnchor | null>(null);
  const closeRowAction = () => setRowAction(null);
  const requestRemove = (
    row: SignatureWindowRow,
    trigger: HTMLButtonElement,
  ) => {
    finalFocus.current = trigger;
    setError(null);
    setPending(row);
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
      <ScannerWindowFrame
        {...props}
        onRequestRemove={requestRemove}
        onOpenActions={openRowActions}
      />
      <SignatureRemovalDialog
        pending={pending}
        busy={busy}
        error={error}
        finalFocus={finalFocus}
        onRemove={props.onRemove}
        onPendingChange={setPending}
        onBusyChange={setBusy}
        onErrorChange={setError}
      />
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

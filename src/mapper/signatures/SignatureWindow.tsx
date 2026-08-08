'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs } from '@/components/ui/tabs';
import type { ScannedKind } from '@/data/maps/scan-parse';
import { MapWindow } from '../windows/MapWindow';
import {
  filterSignatureRows,
  formatSignatureAge,
  signatureCounts,
  type SignatureWindowRow,
} from './signature-model';

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

function SignatureRow({
  row,
  missing,
  canEdit,
  now,
  onDismiss,
  onRequestRemove,
}: {
  readonly row: SignatureWindowRow;
  readonly missing: boolean;
  readonly canEdit: boolean;
  readonly now: number;
  readonly onDismiss: () => void;
  readonly onRequestRemove: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <li
      data-signature-row
      data-signature-id={row.signatureId}
      data-signature-missing={missing || undefined}
      className={cn(
        'relative isolate grid min-h-9 grid-cols-[4.75rem_minmax(0,1fr)_6.5rem_3rem] items-center gap-2 overflow-hidden rounded-ctl px-2 py-1 font-data text-micro',
        missing ? 'map-signature-missing' : 'text-text',
      )}
    >
      <SignalFill signalPct={row.signalPct} />
      <span className="relative z-base text-isk">{row.signatureId}</span>
      <span className="relative z-base truncate text-name">
        {row.name ?? 'Unresolved'}
      </span>
      <span className="relative z-base truncate text-muted">
        {row.group ?? 'Unknown'}
      </span>
      <span className="relative z-base text-right text-muted">
        {formatSignatureAge(row.firstSeenAt, now)}
      </span>
      {missing ? (
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
      ) : null}
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
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        aria-hidden
        className="grid grid-cols-[4.75rem_minmax(0,1fr)_6.5rem_3rem] gap-2 px-2 font-ui text-label uppercase tracking-label text-muted"
      >
        <span>ID</span>
        <span>Name</span>
        <span>Group</span>
        <span className="text-right">Age</span>
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
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Permanent bottom-left scanner window composed beside the managed map stack. */
export function SignatureWindow({
  activeSystemId,
  rows,
  missingIds,
  canEdit,
  complete,
  now,
  onDismissMissing,
  onRemove,
}: {
  readonly activeSystemId: number | null;
  readonly rows: readonly SignatureWindowRow[];
  readonly missingIds: ReadonlySet<string>;
  readonly canEdit: boolean;
  readonly complete: boolean;
  readonly now: number;
  readonly onDismissMissing: (signatureId: string) => void;
  readonly onRemove: (row: SignatureWindowRow) => Promise<void>;
}) {
  const [pending, setPending] = useState<SignatureWindowRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finalFocus = useRef<HTMLElement | null>(null);
  const counts = signatureCounts(rows, activeSystemId);

  const table = (kind: ScannedKind) => (
    <SignatureTable
      rows={filterSignatureRows(rows, activeSystemId, kind)}
      missingIds={missingIds}
      canEdit={canEdit}
      complete={complete}
      now={now}
      onDismiss={onDismissMissing}
      onRequestRemove={(row, trigger) => {
        finalFocus.current = trigger;
        setError(null);
        setPending(row);
      }}
    />
  );

  return (
    <div
      data-signature-window-layer
      className="pointer-events-none absolute inset-0 z-sticky"
    >
      <MapWindow
        windowId="signatures"
        title="Scanner"
        placement={{ kind: 'docked-bottom-left' }}
        stackIndex={1}
        showCloseButton={false}
        onClose={() => undefined}
        onActivate={() => undefined}
      >
        <div data-signature-window className="flex flex-col gap-2">
          <p className="font-data text-micro text-muted">
            {activeSystemId === null
              ? 'Track your active character on this map to paste scanner output.'
              : `Current system ${activeSystemId}`}
          </p>
          <Tabs
            label="Scanner row kinds"
            defaultValue="signature"
            tabs={[
              {
                value: 'signature',
                label: `Signatures ${counts.signatures}`,
                content: table('signature'),
              },
              {
                value: 'anomaly',
                label: `Anomalies ${counts.anomalies}`,
                content: table('anomaly'),
              },
            ]}
          />
        </div>
      </MapWindow>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={`Remove ${pending?.signatureId ?? 'signature'}?`}
        consequence="This row will disappear from the map for 24 hours unless you undo it."
        busy={busy}
        error={error}
        confirmLabel="Remove"
        busyLabel="Removing…"
        onConfirm={() => {
          if (pending === null) return;
          setBusy(true);
          setError(null);
          void onRemove(pending).then(
            () => setPending(null),
            () => setError('The signature could not be removed. Try again.'),
          ).finally(() => setBusy(false));
        }}
        finalFocus={finalFocus}
      />
    </div>
  );
}

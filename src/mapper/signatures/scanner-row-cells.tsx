'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Tooltip } from '@/components/ui/tooltip';
import {
  formatSignatureAge,
  scannerGroupTypeLabel,
  type SignatureWindowRow,
} from './signature-model';
import { scannerRowOpenAction } from './scanner-row-open';

export type OpenRowActions = (
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

function missingDataAttribute(missing: boolean): true | undefined {
  return missing ? true : undefined;
}

function signatureRowTone(missing: boolean): string {
  return missing ? 'map-signature-missing' : 'text-text';
}

function signatureName(row: SignatureWindowRow): string {
  return row.name ?? 'Unresolved';
}

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

export function IdCell({
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

export function NameCell({ row }: { readonly row: SignatureWindowRow }) {
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

export function SiteTypeCell({ row }: { readonly row: SignatureWindowRow }) {
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

export function SignatureRow({
  row,
  missing,
  canEdit,
  resolveSiteId,
  columnsClassName,
  cells,
  showOpenAffordance,
  onOpenActions,
}: {
  readonly row: SignatureWindowRow;
  readonly missing: boolean;
  readonly canEdit: boolean;
  readonly resolveSiteId: (name: string) => number | null;
  readonly columnsClassName: string;
  readonly cells: ReactNode;
  readonly showOpenAffordance: boolean;
  readonly onOpenActions: OpenRowActions;
}) {
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

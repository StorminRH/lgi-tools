import type { Doc } from '@/data/convex/data-model';
import { MAP_CHAIN_UNDO_WINDOW_MS } from '@/data/maps/chain-contract';

/** One newest-first ledger row from the shared map-events subscription. */
export type MapEventRow = Doc<'mapEvents'>;

function systemCount(event: MapEventRow): number {
  return 'systemIds' in event.payload ? event.payload.systemIds.length : 0;
}

function signatureIdCount(event: MapEventRow): number {
  return 'signatureIds' in event.payload ? event.payload.signatureIds.length : 0;
}

/** Human-readable event line for one despawn-ledger kind. */
export function mapEventLabel(event: MapEventRow): string {
  switch (event.kind) {
    case 'connection_severed_retained':
      return 'Severed connection — branch kept';
    case 'branch_removed': {
      const count = systemCount(event);
      return `Removed ${count} downstream system${count === 1 ? '' : 's'}`;
    }
    case 'branch_restored': {
      const count = systemCount(event);
      return `Restored branch (${count} system${count === 1 ? '' : 's'})`;
    }
    case 'connection_restored':
      return 'Restored connection';
    case 'signatures_removed': {
      const count = signatureIdCount(event);
      return `Removed ${count} signature${count === 1 ? '' : 's'}`;
    }
    case 'signatures_restored': {
      const count = signatureIdCount(event);
      return `Restored ${count} signature${count === 1 ? '' : 's'}`;
    }
    default:
      return event.kind;
  }
}

/** The editor action one restorable ledger row offers. */
export type MapEventRestoreAction =
  | { readonly kind: 'branch'; readonly connectionId: string }
  | {
      readonly kind: 'signatures';
      readonly systemId: number;
      readonly signatureIds: readonly string[];
    };

/** Resolves the Restore action for one restorable ledger row. */
export function mapEventRestoreAction(event: MapEventRow): MapEventRestoreAction {
  if ('signatureIds' in event.payload) {
    return {
      kind: 'signatures',
      systemId: event.payload.systemId,
      signatureIds: event.payload.signatureIds,
    };
  }
  return { kind: 'branch', connectionId: event.payload.connectionId };
}

/**
 * Whether a removal/sever row still sits inside the 24-hour undo window and
 * therefore may expose Restore for editors.
 */
export function mapEventRestorable(event: MapEventRow, now: number): boolean {
  if (
    event.kind !== 'connection_severed_retained' &&
    event.kind !== 'branch_removed' &&
    event.kind !== 'signatures_removed'
  ) {
    return false;
  }
  return event.at + MAP_CHAIN_UNDO_WINDOW_MS > now;
}

/** Compact local timestamp for the ledger line. */
export function formatEventTime(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

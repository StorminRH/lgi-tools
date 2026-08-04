import type { Doc } from '@/data/convex/data-model';
import { MAP_CHAIN_UNDO_WINDOW_MS } from '@/data/maps/chain-contract';

/** One newest-first ledger row from the shared map-events subscription. */
export type MapEventRow = Doc<'mapEvents'>;

function systemCount(event: MapEventRow): number {
  return 'systemIds' in event.payload ? event.payload.systemIds.length : 0;
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
    default:
      return event.kind;
  }
}

/** Connection id carried by every basic despawn-ledger payload. */
export function mapEventConnectionId(event: MapEventRow): string {
  return event.payload.connectionId;
}

/**
 * Whether a removal/sever row still sits inside the 24-hour undo window and
 * therefore may expose Restore for editors.
 */
export function mapEventRestorable(event: MapEventRow, now: number): boolean {
  if (
    event.kind !== 'connection_severed_retained' &&
    event.kind !== 'branch_removed'
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

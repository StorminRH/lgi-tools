import { chainTombstoneState } from '@/data/maps/chain-contract';
import type { ConnectionDetail } from '../chain/use-map-chain';

/** Card mode for one selected connection, or null when nothing should open. */
export type ConnectionCardSelection =
  | { readonly connection: ConnectionDetail; readonly mode: 'edit' | 'restore' }
  | null;

/**
 * Derives whether a selected connection may open the card, and in which mode.
 * Skeleton ties and missing rows return null so the host can clear selection.
 */
export function connectionCardSelection(
  connection: ConnectionDetail | null | undefined,
  now: number,
): ConnectionCardSelection {
  if (connection === null || connection === undefined) return null;
  const stage = chainTombstoneState(connection, now);
  if (stage === 'skeleton') return null;
  return {
    connection,
    mode: stage === 'dying' ? 'restore' : 'edit',
  };
}

/** Whether a selected id should be cleared from host state. */
export function shouldClearConnectionSelection(
  connection: ConnectionDetail | null | undefined,
  now: number,
): boolean {
  return connectionCardSelection(connection, now) === null;
}

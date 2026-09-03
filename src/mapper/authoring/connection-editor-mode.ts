import { chainTombstoneState } from '@/data/maps/chain-contract';
import type { ConnectionEditorDetail } from '../chain/connection-detail';

/** Editor mode for one connection, or null when nothing should open. */
export type ConnectionEditorMode =
  | {
      readonly connection: ConnectionEditorDetail;
      readonly mode: 'edit' | 'restore';
    }
  | null;

/**
 * Derives whether a connection may open the Signature Editor, and in which
 * mode. Skeleton ties and missing rows return null so the host closes.
 */
export function connectionEditorMode(
  connection: ConnectionEditorDetail | null | undefined,
  now: number,
): ConnectionEditorMode {
  if (connection === null || connection === undefined) return null;
  const stage = chainTombstoneState(connection, now);
  if (stage === 'skeleton') return null;
  return {
    connection,
    mode: stage === 'dying' ? 'restore' : 'edit',
  };
}

import { chainTombstoneState } from '@/data/maps/chain-contract';
import type { ConnectionEditorDetail } from '../chain/connection-detail';

export type ConnectionEditorMode =
  | {
      readonly connection: ConnectionEditorDetail;
      readonly mode: 'edit' | 'restore';
    }
  | null;

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

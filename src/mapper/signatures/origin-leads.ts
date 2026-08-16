import type { OriginLeadOption } from '../authoring/connection-fields';
import {
  originLeadCandidates,
  type OriginLeadConnection,
} from '../authoring/leads-to-origin';
import type { ConnectionEditorDetail } from '../chain/use-map-chain';
import { destinationReadout } from './system-readout';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';

/**
 * Named inbound systems a scanner/editor stub can attach to. Empty once the
 * hole already has a resolved destination — linking then would be stale.
 */
export function originLeadOptions(
  connection: Pick<
    ConnectionEditorDetail,
    'fromSystemId' | 'connectionId' | 'toSystemId'
  > | null,
  connections: readonly OriginLeadConnection[],
  systemInfo: ((id: number) => SystemDirectoryEntry | null) | null,
): readonly OriginLeadOption[] {
  if (connection === null || connection.toSystemId !== null) return [];
  return originLeadCandidates(
    connection.fromSystemId,
    connection.connectionId,
    connections,
  ).map((candidate) => ({
    connectionId: candidate.connectionId,
    systemId: candidate.systemId,
    label:
      destinationReadout(candidate.systemId, systemInfo)?.label
      ?? String(candidate.systemId),
  }));
}

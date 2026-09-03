import type { OriginLeadOption } from '../authoring/connection-fields';
import {
  originLeadCandidates,
  type OriginLeadConnection,
} from '../authoring/leads-to-origin';
import type { ConnectionEditorDetail } from '../chain/connection-detail';
import { destinationReadout } from './system-readout';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';

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

import type { OriginLeadOption } from '../authoring/connection-fields';
import {
  originLeadCandidates,
  type OriginLeadConnection,
} from '../authoring/leads-to-origin';
import type { ConnectionEditorDetail } from '../chain/connection-detail';
import { destinationReadout } from './system-readout';
import type { SystemInfoLookup } from '@/data/eve-data/universe-assets-client';

export function originLeadOptions(
  connection: Pick<
    ConnectionEditorDetail,
    'fromSystemId' | 'connectionId' | 'toSystemId'
  > | null,
  connections: readonly OriginLeadConnection[],
  systemInfo: SystemInfoLookup | null,
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

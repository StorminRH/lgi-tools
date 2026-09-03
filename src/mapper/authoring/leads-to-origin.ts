import { isTombstoned } from '@/data/maps/chain-contract';
import type { ConnectionTombstone } from '@/data/maps/connection-hallway';

const ORIGIN_LEAD_PREFIX = 'origin:';

export function encodeOriginLead(connectionId: string): string {
  return `${ORIGIN_LEAD_PREFIX}${connectionId}`;
}

export function decodeOriginLead(value: string | null): string | null {
  if (value === null || !value.startsWith(ORIGIN_LEAD_PREFIX)) return null;
  const connectionId = value.slice(ORIGIN_LEAD_PREFIX.length);
  return connectionId.length > 0 ? connectionId : null;
}

export function dispatchLeadsToChange(
  value: string | null,
  onLinkOrigin: (resolvedConnectionId: string) => void,
  onChangeHint: (value: string | null) => void,
): void {
  const originId = decodeOriginLead(value);
  if (originId !== null) {
    onLinkOrigin(originId);
    return;
  }
  onChangeHint(value);
}

export interface OriginLeadCandidate {
  readonly connectionId: string;
  readonly systemId: number;
}

export interface OriginLeadConnection {
  readonly connectionId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number | null;
  readonly from: { readonly signatureId: string | null };
  readonly to: { readonly signatureId: string | null };
  readonly tombstone?: ConnectionTombstone;
}

function otherEndpoint(
  connection: OriginLeadConnection,
  stubSystemId: number,
): number | null {
  if (connection.toSystemId === null) return null;
  if (connection.fromSystemId === stubSystemId) return connection.toSystemId;
  if (connection.toSystemId === stubSystemId) return connection.fromSystemId;
  return null;
}

export function originLeadCandidates(
  stubSystemId: number,
  stubConnectionId: string,
  connections: readonly OriginLeadConnection[],
): readonly OriginLeadCandidate[] {
  const candidates: OriginLeadCandidate[] = [];
  for (const connection of connections) {
    if (
      connection.connectionId === stubConnectionId
      || isTombstoned(connection)
    ) {
      continue;
    }
    const other = otherEndpoint(connection, stubSystemId);
    if (other === null) continue;
    candidates.push({ connectionId: connection.connectionId, systemId: other });
  }
  return candidates;
}

export function originLeadForSystem(
  systemId: number,
  leads: readonly { readonly connectionId: string; readonly systemId: number }[],
): string | null {
  const matches = leads.filter((lead) => lead.systemId === systemId);
  return matches.length === 1 ? matches[0]!.connectionId : null;
}

export function originLeadForTypedLabel(
  text: string,
  leads: readonly { readonly connectionId: string; readonly label: string }[],
): string | null {
  const needle = text.trim().toLowerCase();
  if (needle.length === 0) return null;
  const matches = leads.filter((option) => {
    const label = option.label.toLowerCase();
    return label === needle || label.startsWith(`${needle} - `);
  });
  return matches.length === 1 ? matches[0]!.connectionId : null;
}

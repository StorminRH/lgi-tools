/** Select value prefix for a named origin system already on the map. */
const ORIGIN_LEAD_PREFIX = 'origin:';

/** Encodes one resolved inbound connection as a Leads-to select value. */
export function encodeOriginLead(connectionId: string): string {
  return `${ORIGIN_LEAD_PREFIX}${connectionId}`;
}

/** Reads a Leads-to origin pick, or null when the value is a class hint. */
export function decodeOriginLead(value: string | null): string | null {
  if (value === null || !value.startsWith(ORIGIN_LEAD_PREFIX)) return null;
  const connectionId = value.slice(ORIGIN_LEAD_PREFIX.length);
  return connectionId.length > 0 ? connectionId : null;
}

/** Routes a Leads-to pick to origin-link or class-hint without mixing the two. */
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

/** One resolved inbound line a stub may attach to. */
export interface OriginLeadCandidate {
  readonly connectionId: string;
  readonly systemId: number;
}

/** Facts needed to decide whether a resolved line can be a Leads-to origin. */
export interface OriginLeadConnection {
  readonly connectionId: string;
  readonly fromSystemId: number;
  readonly toSystemId: number | null;
  readonly fromSignatureId: string | null;
  readonly toSignatureId: string | null;
  readonly deletedAt: number | null;
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

function localSignatureLinked(
  connection: OriginLeadConnection,
  stubSystemId: number,
): boolean {
  if (connection.fromSystemId === stubSystemId) {
    return connection.fromSignatureId != null;
  }
  return connection.toSignatureId != null;
}

/**
 * Resolved connections that already touch this stub's system with an empty
 * local signature slot. Atlas never guesses which of those is the way home;
 * the editor only offers them for a human pick.
 */
export function originLeadCandidates(
  stubSystemId: number,
  stubConnectionId: string,
  connections: readonly OriginLeadConnection[],
): readonly OriginLeadCandidate[] {
  const candidates: OriginLeadCandidate[] = [];
  for (const connection of connections) {
    if (
      connection.connectionId === stubConnectionId
      || connection.deletedAt != null
    ) {
      continue;
    }
    const other = otherEndpoint(connection, stubSystemId);
    if (other === null || localSignatureLinked(connection, stubSystemId)) {
      continue;
    }
    candidates.push({ connectionId: connection.connectionId, systemId: other });
  }
  return candidates;
}

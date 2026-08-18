/** Select value prefix for another system already on this hallway. */
const ORIGIN_LEAD_PREFIX = 'origin:';

/** Encodes one resolved incoming hallway as a Leads-to select value. */
export function encodeOriginLead(connectionId: string): string {
  return `${ORIGIN_LEAD_PREFIX}${connectionId}`;
}

/** Reads a Leads-to pick of another system on the map, or null when the value is a class hint. */
export function decodeOriginLead(value: string | null): string | null {
  if (value === null || !value.startsWith(ORIGIN_LEAD_PREFIX)) return null;
  const connectionId = value.slice(ORIGIN_LEAD_PREFIX.length);
  return connectionId.length > 0 ? connectionId : null;
}

/** Routes a Leads-to pick to an incoming-hallway link or a class hint without mixing the two. */
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

/** One resolved hallway this stub may attach to; `systemId` is the other system. */
export interface OriginLeadCandidate {
  readonly connectionId: string;
  readonly systemId: number;
}

/** Facts needed to decide whether a resolved hallway can be a Leads-to target. */
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

/**
 * Resolved hallways that already touch this stub's system, including incoming
 * K162s whose scanner ID is already filled. Occupied mouths stay listed so a
 * human can move that join onto a different hole. Atlas never guesses which
 * K162 is incoming from a given system; the editor only offers them to pick.
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
    if (other === null) continue;
    candidates.push({ connectionId: connection.connectionId, systemId: other });
  }
  return candidates;
}

/**
 * The one hallway whose other system is this id, or null when none or more
 * than one match — Atlas does not guess which incoming K162 that is.
 */
export function originLeadForSystem(
  systemId: number,
  leads: readonly { readonly connectionId: string; readonly systemId: number }[],
): string | null {
  const matches = leads.filter((lead) => lead.systemId === systemId);
  return matches.length === 1 ? matches[0]!.connectionId : null;
}

/**
 * The one hallway whose label matches typed text, or null when none or more
 * than one match. Same no-guess rule as {@link originLeadForSystem}.
 */
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

import type { ConnectionProvenance } from '@/data/eve-data/wormhole-contract';
import { signatureIdentityKey, type SignatureWindowRow } from './signature-model';

/** How long an automatically updated scanner row stays highlighted. */
export const SIGNATURE_UPDATE_FLASH_MS = 2_600;

/** Writes the eliminator and the jump resolver make, never a person. */
const MACHINE_PROVENANCES: ReadonlySet<ConnectionProvenance> = new Set([
  'assumed',
  'jump-verified',
]);

/** The facts on a scanner row that automation can fill in. */
export interface SignatureRowFacts {
  readonly typeCode: string | null;
  readonly typeByMachine: boolean;
  readonly destinationSystemId: number | null;
  readonly destinationByMachine: boolean;
}

function signatureRowFacts(row: SignatureWindowRow): SignatureRowFacts | null {
  const connection = row.connection;
  if (connection === null) return null;
  const toSide = row.endpoint === 'to';
  const { identity, resolution } = connection;
  return {
    typeCode: (toSide ? connection.to : connection.from).typeCode,
    typeByMachine: identity.kind === 'typed' && MACHINE_PROVENANCES.has(identity.provenance),
    destinationSystemId: toSide ? connection.fromSystemId : connection.toSystemId,
    destinationByMachine:
      resolution.kind === 'destination' && MACHINE_PROVENANCES.has(resolution.provenance),
  };
}

function filledByMachine(
  previous: SignatureRowFacts,
  next: SignatureRowFacts,
): boolean {
  const typed = next.typeByMachine
    && next.typeCode !== null
    && next.typeCode !== previous.typeCode;
  const destined = next.destinationByMachine
    && next.destinationSystemId !== null
    && next.destinationSystemId !== previous.destinationSystemId;
  return typed || destined;
}

/**
 * Compares a live scanner update against the last one it saw and names the
 * rows whose wormhole type or destination automation just filled in. Rows
 * seen for the first time never count, so loading a system does not flash.
 */
export function diffSignatureUpdates(
  previous: ReadonlyMap<string, SignatureRowFacts>,
  rows: readonly SignatureWindowRow[],
): {
  readonly snapshot: ReadonlyMap<string, SignatureRowFacts>;
  readonly updated: ReadonlySet<string>;
} {
  const snapshot = new Map<string, SignatureRowFacts>();
  const updated = new Set<string>();
  for (const row of rows) {
    const facts = signatureRowFacts(row);
    if (facts === null) continue;
    const key = signatureIdentityKey(row);
    snapshot.set(key, facts);
    const before = previous.get(key);
    if (before !== undefined && filledByMachine(before, facts)) updated.add(key);
  }
  return { snapshot, updated };
}

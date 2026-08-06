// Pure selection and labeling for the confirm/correct prompt over an assumed
// automatic hole link. The survivor list on the resolved row preserves the
// matcher's deterministic ordering; this module only resolves those ids to
// display facts and decides which pending resolution to surface.
import type { Id } from '@/data/convex/data-model';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/use-map-chain';

/** One selectable candidate for a pending auto-link resolution. */
export interface JumpResolutionCandidate {
  readonly connectionId: Id<'mapConnections'>;
  readonly signatureId: string | null;
  readonly wormholeTypeCode: string | null;
  /** True for the slot the eliminator resolved into (the connection itself). */
  readonly isCurrent: boolean;
}

/** One pending assumed resolution: the resolved row plus its recorded survivors. */
export interface JumpResolutionModel {
  readonly connectionId: Id<'mapConnections'>;
  readonly candidates: readonly JumpResolutionCandidate[];
}

/** Whether one connection row still carries an answerable assumed auto-link. */
export function hasPendingResolution(connection: ConnectionDetail): boolean {
  return (
    connection.destinationProvenance === 'assumed' &&
    connection.pendingCandidates !== null &&
    connection.pendingCandidates.length > 0 &&
    connection.deletedAt === null
  );
}

/**
 * Resolves the recorded survivor ids to labeled candidates. The resolved row
 * itself leads; other survivors label from the live unresolved feed and drop
 * out silently once they resolve or tombstone elsewhere.
 */
export function jumpResolutionCandidates(
  connection: ConnectionDetail,
  unresolvedHoles: readonly UnresolvedHoleSummary[],
): readonly JumpResolutionCandidate[] {
  const candidates: JumpResolutionCandidate[] = [];
  for (const candidateId of connection.pendingCandidates ?? []) {
    if (candidateId === connection.connectionId) {
      candidates.push({
        connectionId: candidateId,
        signatureId: connection.fromSignatureId,
        wormholeTypeCode: connection.wormholeTypeCode,
        isCurrent: true,
      });
      continue;
    }
    const hole = unresolvedHoles.find((row) => row.connectionId === candidateId);
    if (hole === undefined) continue;
    candidates.push({
      connectionId: hole.connectionId,
      signatureId: hole.fromSignatureId,
      wormholeTypeCode: hole.wormholeTypeCode,
      isCurrent: false,
    });
  }
  return candidates.toSorted(
    (left, right) => Number(right.isCurrent) - Number(left.isCurrent),
  );
}

/**
 * The newest pending assumed resolution not locally dismissed, or null. One at
 * a time keeps the prompt non-blocking; older pending rows stay answerable
 * from their connection cards.
 */
export function pendingJumpResolution(
  details: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>,
  unresolvedHoles: readonly UnresolvedHoleSummary[],
  dismissed: ReadonlySet<string>,
): JumpResolutionModel | null {
  let newest: ConnectionDetail | null = null;
  for (const connection of details.values()) {
    if (!hasPendingResolution(connection)) continue;
    if (dismissed.has(connection.connectionId)) continue;
    if (newest === null || connection._creationTime > newest._creationTime) {
      newest = connection;
    }
  }
  if (newest === null) return null;
  return {
    connectionId: newest.connectionId,
    candidates: jumpResolutionCandidates(newest, unresolvedHoles),
  };
}

/** Short human label for one candidate: signature identity plus typed code. */
export function jumpCandidateLabel(candidate: JumpResolutionCandidate): string {
  const signature = candidate.signatureId ?? 'Unscanned';
  const code = candidate.wormholeTypeCode ?? 'Unidentified';
  return `${signature} · ${code}`;
}

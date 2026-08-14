// Pure selection and labeling for the confirm/correct prompt over an assumed
// automatic hole link. The survivor list on the resolved row preserves the
// matcher's deterministic ordering; this module only resolves those ids to
// display facts and decides which pending resolution to surface.
import type { Id } from '@/data/convex/data-model';
import type { SystemIdentityReadout } from '@/data/eve-data/system-identity';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/use-map-chain';
import { destinationReadout } from './system-readout';

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
  readonly destination: SystemIdentityReadout;
  readonly candidates: readonly JumpResolutionCandidate[];
}

/** Route target for one survivor pick: null confirms the already-linked row. */
export function jumpAnswerTarget(
  candidate: JumpResolutionCandidate,
): Id<'mapConnections'> | null {
  return candidate.isCurrent ? null : candidate.connectionId;
}

/** Whether one connection row still carries an answerable assumed auto-link. */
export function hasPendingResolution(connection: ConnectionDetail): boolean {
  return (
    connection.destinationProvenance === 'assumed' &&
    connection.pendingCandidates !== null &&
    connection.pendingCandidates.length > 1 &&
    connection.deletedAt === null
  );
}

/**
 * Resolves the recorded survivor ids to labeled candidates in the matcher's
 * exact order. Any now-unrepresentable survivor makes the whole prompt stale.
 */
export function jumpResolutionCandidates(
  connection: ConnectionDetail,
  unresolvedHoles: readonly UnresolvedHoleSummary[],
): readonly JumpResolutionCandidate[] | null {
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
    // The stored array is the matcher's exact survivor list. If a concurrent
    // update makes one survivor unrepresentable, withhold the stale prompt as
    // a whole instead of silently presenting a shortened, dishonest list.
    if (hole === undefined) return null;
    candidates.push({
      connectionId: hole.connectionId,
      signatureId: hole.fromSignatureId,
      wormholeTypeCode: hole.wormholeTypeCode,
      isCurrent: false,
    });
  }
  return candidates;
}

/**
 * The newest exact multi-survivor resolution owned by one of this client's
 * tracked characters and not locally answered, or null. One at a time keeps
 * the scanner prompt rail non-blocking; scoping keeps another pilot's jump
 * from asking every editor on the map.
 */
export function pendingJumpResolution(
  details: ReadonlyMap<Id<'mapConnections'>, ConnectionDetail>,
  unresolvedHoles: readonly UnresolvedHoleSummary[],
  dismissed: ReadonlySet<string>,
  systemInfo: ((id: number) => SystemDirectoryEntry | null) | null,
  ownCharacterIds: ReadonlySet<number>,
): JumpResolutionModel | null {
  let newest: JumpResolutionModel | null = null;
  let newestCreatedAt = Number.NEGATIVE_INFINITY;
  for (const connection of details.values()) {
    if (!hasPendingResolution(connection)) continue;
    const ownerId = connection.pendingResolutionCharacterId;
    if (ownerId === null || !ownCharacterIds.has(ownerId)) continue;
    if (dismissed.has(connection.connectionId)) continue;
    const candidates = jumpResolutionCandidates(connection, unresolvedHoles);
    const destination = destinationReadout(connection.toSystemId, systemInfo);
    if (candidates === null || candidates.length <= 1 || destination === null) continue;
    if (connection._creationTime <= newestCreatedAt) continue;
    newestCreatedAt = connection._creationTime;
    newest = {
      connectionId: connection.connectionId,
      destination,
      candidates,
    };
  }
  return newest;
}

/** Short human label for one candidate: signature identity plus typed code. */
export function jumpCandidateLabel(candidate: JumpResolutionCandidate): string {
  const signature = candidate.signatureId ?? 'Unscanned';
  const code = candidate.wormholeTypeCode ?? 'Unidentified';
  return `${signature} · ${code}`;
}

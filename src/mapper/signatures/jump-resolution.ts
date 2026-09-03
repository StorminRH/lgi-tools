import type { Id } from '@/data/convex/data-model';
import type { SystemIdentityReadout } from '@/data/eve-data/system-identity';
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';
import {
  isConnectionRemoved,
  hasAnswerablePrompt,
} from '@/data/maps/connection-hallway';
import type {
  ConnectionDetail,
  UnresolvedHoleSummary,
} from '../chain/connection-detail';
import { destinationReadout } from './system-readout';

export interface JumpResolutionCandidate {
  readonly connectionId: Id<'mapConnections'>;
  readonly signatureId: string | null;
  readonly wormholeTypeCode: string | null;
  readonly isCurrent: boolean;
}

export interface JumpResolutionModel {
  readonly connectionId: Id<'mapConnections'>;
  readonly destination: SystemIdentityReadout;
  readonly candidates: readonly JumpResolutionCandidate[];
}

export function jumpAnswerTarget(
  candidate: JumpResolutionCandidate,
): Id<'mapConnections'> | null {
  return candidate.isCurrent ? null : candidate.connectionId;
}

export function hasPendingResolution(connection: ConnectionDetail): boolean {
  return (
    hasAnswerablePrompt(connection.resolution) &&
    !isConnectionRemoved(connection.tombstone)
  );
}

export function jumpResolutionCandidates(
  connection: ConnectionDetail,
  unresolvedHoles: readonly UnresolvedHoleSummary[],
): readonly JumpResolutionCandidate[] | null {
  const candidates: JumpResolutionCandidate[] = [];
  const candidateIds =
    connection.resolution.kind === 'pending'
      ? connection.resolution.candidateIds
      : [];
  for (const candidateId of candidateIds) {
    if (candidateId === connection.connectionId) {
      candidates.push({
        connectionId: candidateId,
        signatureId: connection.from.signatureId,
        wormholeTypeCode: connection.from.typeCode,
        isCurrent: true,
      });
      continue;
    }
    const hole = unresolvedHoles.find((row) => row.connectionId === candidateId);
    if (hole === undefined) return null;
    candidates.push({
      connectionId: hole.connectionId,
      signatureId: hole.from.signatureId,
      wormholeTypeCode: hole.from.typeCode,
      isCurrent: false,
    });
  }
  return candidates;
}

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
    const ownerId =
      connection.resolution.kind === 'pending'
        ? connection.resolution.characterId
        : null;
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

export function jumpCandidateLabel(candidate: JumpResolutionCandidate): string {
  const signature = candidate.signatureId ?? 'Unscanned';
  const code = candidate.wormholeTypeCode ?? 'Unidentified';
  return `${signature} · ${code}`;
}

import {
  authorJumpDoor,
  confirmJumpDoor,
  jumpConnectionEvidenceDoor,
  jumpTransitionEvidenceDoor,
  reassociateJumpDoor,
} from '@/data/maps/convex-doors';
import type { ConvexDoorRequest, ConvexDoorResponse } from '@/lib/convex-door-contract';
import {
  ConvexDoorError,
  postConvexHttpDoor,
  type ConvexDoorOptions,
} from '@/lib/convex-http-door';

export type ConnectionEmissionFacts = ConvexDoorResponse<typeof confirmJumpDoor>;

export type TransitionEvidence = ConvexDoorResponse<typeof jumpTransitionEvidenceDoor>;

export type ConnectionEvidence = ConvexDoorResponse<typeof jumpConnectionEvidenceDoor>;

export type AuthorJumpResult = ConvexDoorResponse<typeof authorJumpDoor>;

export class JumpConvexUnavailableError extends ConvexDoorError {
  override readonly name = 'JumpConvexUnavailableError';
}

const JUMP_DOOR_OPTIONS: ConvexDoorOptions = {
  error: JumpConvexUnavailableError,
  label: 'Jump resolver unavailable',
};

export function readTransitionEvidence(
  userId: string,
  mapId: string,
  characterId: number,
): Promise<TransitionEvidence> {
  return postConvexHttpDoor(
    jumpTransitionEvidenceDoor,
    { mode: 'transition', userId, mapId, characterId },
    JUMP_DOOR_OPTIONS,
  );
}

export function readConnectionEvidence(
  userId: string,
  mapId: string,
  connectionId: string,
): Promise<ConnectionEvidence> {
  return postConvexHttpDoor(
    jumpConnectionEvidenceDoor,
    { mode: 'connection', userId, mapId, connectionId },
    JUMP_DOOR_OPTIONS,
  );
}

export function authorJump(
  input: Omit<ConvexDoorRequest<typeof authorJumpDoor>, 'operation'>,
): Promise<AuthorJumpResult> {
  return postConvexHttpDoor(authorJumpDoor, { operation: 'author', ...input }, JUMP_DOOR_OPTIONS);
}

export function answerJump(
  input: ConvexDoorRequest<typeof confirmJumpDoor | typeof reassociateJumpDoor>,
): Promise<ConnectionEmissionFacts> {
  return input.operation === 'confirm'
    ? postConvexHttpDoor(confirmJumpDoor, input, JUMP_DOOR_OPTIONS)
    : postConvexHttpDoor(reassociateJumpDoor, input, JUMP_DOOR_OPTIONS);
}

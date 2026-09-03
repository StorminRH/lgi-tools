import { REACTION_ACTIVITY } from './structure-bonus';
import { hostsReactions } from './structure-factors';
import type { AvailableStructure } from './types';

export interface ReactionLocationSnapshot {
  systemId: number;
  blueprintTypeId: number;
  costIndex: number | null;
  adjustedPrices: Map<number, number>;
}

export function buildSelectionVacatesReaction(
  buildStructure: AvailableStructure | null,
  reactionStructure: AvailableStructure | null,
): boolean {
  return (
    buildStructure !== null &&
    reactionStructure !== null &&
    buildStructure.id === reactionStructure.id
  );
}

export function selectReactionLocation(args: {
  activityId: number;
  blueprintTypeId: number;
  reactionSystemId: number | null;
  fetched: ReactionLocationSnapshot | null;
}): ReactionLocationSnapshot | null {
  const { activityId, blueprintTypeId, reactionSystemId, fetched } = args;
  if (
    activityId !== REACTION_ACTIVITY ||
    fetched === null ||
    fetched.systemId !== reactionSystemId ||
    fetched.blueprintTypeId !== blueprintTypeId
  ) {
    return null;
  }
  return fetched;
}

export function isReactionNetAvailable(args: {
  activityId: number;
  reactionLocation: ReactionLocationSnapshot | null;
  buildStructure: AvailableStructure | null;
  hasBuildLocation: boolean;
}): boolean {
  return (
    args.activityId === REACTION_ACTIVITY &&
    (args.reactionLocation !== null ||
      (args.buildStructure !== null &&
        hostsReactions(args.buildStructure.groupId) &&
        args.hasBuildLocation))
  );
}

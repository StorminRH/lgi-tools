import { REACTION_ACTIVITY } from './structure-bonus';
import { hostsReactions } from './structure-factors';
import type { AvailableStructure } from './types';

export interface ReactionLocationSnapshot {
  systemId: number;
  blueprintTypeId: number;
  costIndex: number | null;
  adjustedPrices: Map<number, number>;
}

// A structure cannot occupy both planner slots. The option lists prevent most
// conflicts, but this state-level verdict also covers template/programmatic
// selection so a stale reaction slot can never keep contributing.
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

// The fetched reaction fee inputs are valid only for the currently rendered
// reaction blueprint and selected system. Mismatches resolve to absence rather
// than requiring effect-body clearing, so late reads cannot revive stale data.
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

// A reaction blueprint can expose net margin when its dedicated location read
// has settled, or when the build slot is itself a refinery with a build system.
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

'use client';

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { createBuildSystemApplier, type ApplySystemOptions } from '../build-system-apply';
import type { ReactionLocationSnapshot } from '../selection-policy';
import { REACTION_ACTIVITY } from '../structure-bonus';
import type { BlueprintStructure, JobSystemRef } from '../types';
import { useResourceRead } from '@/lib/use-resource-read';
import type { SelectedLocation } from './planner-contexts';
import { readCostIndices } from './read-cost-indices';

/** One system's job cost indices; null when the read failed or was cancelled. */
async function readSystemCostIndex(systemId: number, signal: AbortSignal) {
  const bySystem = await readCostIndices([systemId], signal);
  return bySystem?.get(systemId) ?? null;
}

/**
 * Reads the build and reaction systems' cost indices. A profile picks the
 * systems; with none, nothing is read and the build prices without fees.
 */
export function usePlannerLocationWrites(
  structure: BlueprintStructure,
  setLocation: (loc: SelectedLocation | null) => void,
  reactionSystemId: number | null,
  setFetchedReactionLocation: Dispatch<SetStateAction<ReactionLocationSnapshot | null>>,
  reactionLocation: ReactionLocationSnapshot | null,
) {
  const [failureSystemId, setFailureSystemId] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  // A retry starts clean: the notice goes until the new attempts fail too.
  const retryLocation = useCallback(() => {
    setFailureSystemId(null);
    setRetry((attempt) => attempt + 1);
  }, []);
  const applyBuildSystem = useMemo(
    () => {
      const apply = createBuildSystemApplier({
        fetchLocation: readSystemCostIndex,
        onApplied: (sys, index) =>
          setLocation({
            systemId: sys.systemId,
            systemName: sys.systemName,
            security: sys.security,
            costIndices: { manufacturing: index.manufacturing, reaction: index.reaction },
          }),
        onPersist: () => {},
      });
      // The system priced until now stays while the next is read, so the
      // planner does not ask twice; a failed read clears it rather than
      // leaving another system's fees standing.
      return async (sys: JobSystemRef, opts: ApplySystemOptions) => {
        const outcome = await apply(sys, opts);
        if (outcome.status === 'failed') {
          setLocation(null);
          setFailureSystemId(sys.systemId);
        }
        if (outcome.status === 'applied') setFailureSystemId(null);
        return outcome;
      };
    },
    [setLocation],
  );
  const readReactionLocation = useCallback(
    async (signal: AbortSignal): Promise<ReactionLocationSnapshot | null> => {
      if (reactionSystemId === null) return null;
      setFetchedReactionLocation(null);
      const index = await readSystemCostIndex(reactionSystemId, signal);
      if (signal.aborted) return null;
      setFailureSystemId(index ? null : reactionSystemId);
      return index
        ? { systemId: reactionSystemId, blueprintTypeId: structure.blueprintTypeId, costIndex: index.reaction }
        : null;
    },
    [reactionSystemId, structure.blueprintTypeId, setFetchedReactionLocation],
  );
  const readsReaction = structure.activityId === REACTION_ACTIVITY && reactionSystemId !== null && !(
    reactionLocation?.systemId === reactionSystemId &&
    reactionLocation.blueprintTypeId === structure.blueprintTypeId
  );
  useResourceRead(readReactionLocation, {
    enabled: readsReaction,
    onData: setFetchedReactionLocation,
    refreshKey: retry,
  });
  return {
    applyBuildSystem,
    failureSystemId,
    retryLocation,
    retry,
    reactionPending: readsReaction && failureSystemId !== reactionSystemId,
  };
}

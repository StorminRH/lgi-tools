'use client';

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { apiFetch } from '@/transport/api-client';
import { buildLocationEndpoint } from '../api-contract';
import { createBuildSystemApplier, type ApplySystemOptions, type BuildSystemRef } from '../build-system-apply';
import { readWithRetries } from '../read-with-retries';
import type { ReactionLocationSnapshot } from '../selection-policy';
import { REACTION_ACTIVITY } from '../structure-bonus';
import type { BlueprintStructure } from '../types';
import { useResourceRead } from '../use-resource-read';
import type { SelectedLocation } from './planner-contexts';

/**
 * Reads the build and reaction systems' cost indices and prices.
 * A profile picks the systems; with none, nothing is
 * read and the build prices without fees.
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
        fetchLocation: (systemId, signal) =>
          readWithRetries(async () => {
            const res = await apiFetch(buildLocationEndpoint, {
              body: { systemId, blueprintId: structure.blueprintTypeId },
              cache: 'no-store',
              signal,
            });
            return res.ok ? res.data : null;
          }, signal),
        onApplied: (sys, data) =>
          setLocation({
            systemId: sys.systemId,
            systemName: sys.systemName,
            security: sys.security,
            stations: data.stations,
            costIndices: data.costIndices,
            adjustedPrices: new Map(data.adjustedPrices.map((a) => [a.typeId, a.adjustedPrice])),
          }),
        onPersist: () => {},
      });
      // The system priced until now stays while the next is read, so the
      // planner does not ask twice; a failed read clears it rather than
      // leaving another system's fees standing.
      return async (sys: BuildSystemRef, opts: ApplySystemOptions) => {
        const outcome = await apply(sys, opts);
        if (outcome.status === 'failed') {
          setLocation(null);
          setFailureSystemId(sys.systemId);
        }
        if (outcome.status === 'applied') setFailureSystemId(null);
        return outcome;
      };
    },
    [structure.blueprintTypeId, setLocation],
  );
  const readReactionLocation = useCallback(
    async (signal: AbortSignal): Promise<ReactionLocationSnapshot | null> => {
      if (reactionSystemId === null) return null;
      setFetchedReactionLocation(null);
      const data = await readWithRetries(async () => {
        const res = await apiFetch(buildLocationEndpoint, {
          body: { systemId: reactionSystemId, blueprintId: structure.blueprintTypeId },
          cache: 'no-store',
          signal,
        });
        return res.ok ? res.data : null;
      }, signal);
      if (signal.aborted) return null;
      setFailureSystemId(data ? null : reactionSystemId);
      return data
        ? {
            systemId: reactionSystemId,
            blueprintTypeId: structure.blueprintTypeId,
            costIndex: data.costIndices.reaction ?? null,
            adjustedPrices: new Map(
              data.adjustedPrices.map((price) => [price.typeId, price.adjustedPrice]),
            ),
          }
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

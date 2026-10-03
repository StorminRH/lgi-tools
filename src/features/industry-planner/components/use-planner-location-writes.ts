'use client';

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { apiFetch } from '@/transport/api-client';
import { buildLocationEndpoint } from '../api-contract';
import { createBuildSystemApplier, type ApplySystemOptions, type BuildSystemRef } from '../build-system-apply';
import type { ReactionLocationSnapshot } from '../selection-policy';
import { REACTION_ACTIVITY } from '../structure-bonus';
import type { AvailableStructure, BlueprintStructure } from '../types';
import { readAvailableStructures } from '../use-available-structures';
import { useResourceRead } from '../use-resource-read';
import type { SelectedLocation } from './planner-contexts';

/**
 * Reads the build and reaction systems' cost indices and prices, and the
 * account's structures. A profile picks the systems; with none, nothing is
 * read and the build prices without fees.
 */
export function usePlannerLocationWrites(
  structure: BlueprintStructure,
  setLocation: (loc: SelectedLocation | null) => void,
  reactionSystemId: number | null,
  setFetchedReactionLocation: Dispatch<SetStateAction<ReactionLocationSnapshot | null>>,
  setAvailableStructures: Dispatch<SetStateAction<AvailableStructure[] | null>>,
  reactionLocation: ReactionLocationSnapshot | null,
) {
  const [failureSystemId, setFailureSystemId] = useState<number | null>(null);
  const [retry, setRetry] = useState(0);
  const retryLocation = useCallback(() => setRetry((attempt) => attempt + 1), []);
  const applyBuildSystem = useMemo(
    () => {
      const apply = createBuildSystemApplier({
        fetchLocation: async (systemId, signal) => {
          const res = await apiFetch(buildLocationEndpoint, {
            body: { systemId, blueprintId: structure.blueprintTypeId },
            cache: 'no-store',
            signal,
          });
          return res.ok ? res.data : null;
        },
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
      return async (sys: BuildSystemRef, opts: ApplySystemOptions) => {
        setLocation(null);
        const outcome = await apply(sys, opts);
        if (outcome.status === 'failed') setFailureSystemId(sys.systemId);
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
      const res = await apiFetch(buildLocationEndpoint, {
        body: { systemId: reactionSystemId, blueprintId: structure.blueprintTypeId },
        cache: 'no-store',
        signal,
      }).catch(() => null);
      if (signal.aborted) return null;
      setFailureSystemId(res?.ok ? null : reactionSystemId);
      return res?.ok
        ? {
            systemId: reactionSystemId,
            blueprintTypeId: structure.blueprintTypeId,
            costIndex: res.data.costIndices.reaction ?? null,
            adjustedPrices: new Map(
              res.data.adjustedPrices.map((price) => [price.typeId, price.adjustedPrice]),
            ),
          }
        : null;
    },
    [reactionSystemId, structure.blueprintTypeId, setFetchedReactionLocation],
  );
  useResourceRead(readReactionLocation, {
    enabled: structure.activityId === REACTION_ACTIVITY && reactionSystemId !== null && !(
      reactionLocation?.systemId === reactionSystemId &&
      reactionLocation.blueprintTypeId === structure.blueprintTypeId
    ),
    onData: setFetchedReactionLocation,
    refreshKey: retry,
  });
  useResourceRead(readAvailableStructures, {
    enabled: true,
    onData: setAvailableStructures,
  });
  return { applyBuildSystem, failureSystemId, retryLocation, retry };
}

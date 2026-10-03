'use client';

import { useCallback, useMemo, useState } from 'react';
import { apiFetch } from '@/transport/api-client';
import { buildLocationEndpoint, costIndicesEndpoint } from '../api-contract';
import type { AssembleOptions } from '../build-pricing';
import { profileFeeSiteOf } from '../component-job-fees';
import type { ProfilePlan } from '../profiles/profile-plan';
import type { BlueprintStructure, SystemJobCostIndex } from '../types';
import { useResourceRead } from '../use-resource-read';

export type ComponentFeeInputs = NonNullable<NonNullable<AssembleOptions['fee']>['components']> & {
  adjustedPriceOf: (typeId: number) => number | null;
};

interface ReadIndices {
  key: string;
  bySystem: ReadonlyMap<number, SystemJobCostIndex> | null;
}

interface ReadPrices {
  key: string;
  prices: ReadonlyMap<number, number> | null;
}

/**
 * Where a profile installs every job below the product's, and the cost
 * indices of those systems. Null without a profile: then only the
 * product's own job is charged.
 */
export function useComponentFeeSources(
  structure: BlueprintStructure,
  plan: ProfilePlan | null,
  refreshKey: number,
  needAdjustedPrices: boolean,
): { sources: ComponentFeeInputs | null; failed: boolean } {
  const siteOf = useMemo(() => (plan ? profileFeeSiteOf(plan) : null), [plan]);
  // The systems as a stable key, so a plan rebuilt with the same facilities reads nothing again.
  const key = useMemo(() => {
    if (!siteOf) return '';
    const ids = new Set<number>();
    for (const bp of Object.keys(structure.nodeActivityByBlueprint)) {
      const { systemId } = siteOf(Number(bp));
      if (systemId !== null) ids.add(systemId);
    }
    return [...ids].sort((a, b) => a - b).join(',');
  }, [siteOf, structure.nodeActivityByBlueprint]);
  const priceSystemId = useMemo(() => {
    if (!siteOf) return null;
    for (const bp of Object.keys(structure.nodeActivityByBlueprint)) {
      if (Number(bp) === structure.blueprintTypeId) continue;
      const { systemId } = siteOf(Number(bp));
      if (systemId !== null) return systemId;
    }
    return null;
  }, [siteOf, structure.nodeActivityByBlueprint, structure.blueprintTypeId]);
  const priceKey = `${structure.blueprintTypeId}:${priceSystemId}`;
  const [prices, setPrices] = useState<ReadPrices | null>(null);
  const [indices, setIndices] = useState<ReadIndices | null>(null);
  const read = useCallback(
    async (signal: AbortSignal): Promise<ReadIndices | null> => {
      const res = await apiFetch(costIndicesEndpoint, {
        body: { systemIds: key.split(',').map(Number) },
        cache: 'no-store',
        signal,
      }).catch(() => null);
      if (signal.aborted) return null;
      return {
        key,
        bySystem: res?.ok ? new Map(res.data.systems.map((s) => [s.systemId, s])) : null,
      };
    },
    [key],
  );
  useResourceRead(read, { enabled: key !== '', onData: setIndices, refreshKey });
  const readPrices = useCallback(async (signal: AbortSignal): Promise<ReadPrices | null> => {
    if (priceSystemId === null) return null;
    const res = await apiFetch(buildLocationEndpoint, {
      body: { systemId: priceSystemId, blueprintId: structure.blueprintTypeId },
      cache: 'no-store',
      signal,
    }).catch(() => null);
    if (signal.aborted) return null;
    return {
      key: priceKey,
      prices: res?.ok ? new Map(res.data.adjustedPrices.map((p) => [p.typeId, p.adjustedPrice])) : null,
    };
  }, [priceSystemId, priceKey, structure.blueprintTypeId]);
  const readPricesEnabled = needAdjustedPrices && priceSystemId !== null;
  useResourceRead(readPrices, { enabled: readPricesEnabled, onData: setPrices, refreshKey });
  const sources = useMemo(() => {
    if (!siteOf) return null;
    // Until this plan's systems are read, no job has an index and the net stays open.
    const bySystem = indices?.key === key ? indices.bySystem : null;
    return {
      siteOf,
      costIndexOf: (systemId: number, reaction: boolean) =>
        bySystem?.get(systemId)?.[reaction ? 'reaction' : 'manufacturing'] ?? null,
      adjustedPriceOf: (typeId: number) => prices?.key === priceKey ? prices.prices?.get(typeId) ?? null : null,
    };
  }, [siteOf, indices, key, prices, priceKey]);
  return {
    sources,
    failed: (key !== '' && indices?.key === key && indices.bySystem === null) ||
      (readPricesEnabled && prices?.key === priceKey && prices.prices === null),
  };
}

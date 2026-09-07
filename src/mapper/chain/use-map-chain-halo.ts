'use client';

import { useCallback, useMemo } from 'react';
import { systemSecurityClass } from '@/data/eve-data/security';
import {
  deriveHalo,
  EMPTY_HALO,
  haloSignature,
  type HaloLimits,
} from '../halo/halo-model';
import { resolveSystemLabel, type SystemLabel } from './labels';
import type { UnresolvedHoleSummary } from './connection-detail';
import {
  stubPostKey,
  type AccountedStubLayoutRow,
} from './stub-layout';
import { useUniverseAssets } from './use-universe-assets';

const EMPTY_NEIGHBOURS: readonly number[] = [];

export function useMapChainHalo(
  authoredKey: string,
  stubLayout: readonly AccountedStubLayoutRow[],
  slotHolders: readonly UnresolvedHoleSummary[] = [],
  haloLimits?: HaloLimits,
) {
  const assets = useUniverseAssets();

  const halo = useMemo(() => {
    if (assets === null || authoredKey.length === 0) return EMPTY_HALO;
    return deriveHalo({
      authoredSystems: authoredKey
        .split(',')
        .map((id, order) => ({ systemId: Number(id), order })),
      neighbours: (id) => assets.neighbours(id),
      securityClassOf: (id) => {
        const entry = assets.systemInfo(id);
        if (entry === null) return undefined;
        return systemSecurityClass(entry.security, entry.whClassId);
      },
      limits: haloLimits,
    });
  }, [authoredKey, assets, haloLimits]);
  const haloKey = useMemo(() => haloSignature(halo), [halo]);
  const stubKey = useMemo(
    () => stubPostKey(stubLayout, slotHolders),
    [stubLayout, slotHolders],
  );
  const labelOf = useCallback(
    (systemId: number): SystemLabel =>
      resolveSystemLabel(
        systemId,
        assets === null ? null : (id: number) => assets.systemInfo(id),
      ),
    [assets],
  );

  const neighboursOf = useCallback(
    (systemId: number): readonly number[] =>
      assets === null ? EMPTY_NEIGHBOURS : assets.neighbours(systemId),
    [assets],
  );

  return { halo, haloKey, labelOf, neighboursOf, stubKey };
}

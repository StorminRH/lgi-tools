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
import {
  stubLayoutSignature,
  type AccountedStubLayoutRow,
} from './stub-layout';
import { useUniverseAssets } from './use-universe-assets';

const EMPTY_NEIGHBOURS: readonly number[] = [];

export function useMapChainHalo(
  authoredKey: string,
  stubLayout: readonly AccountedStubLayoutRow[],
  haloLimits?: HaloLimits,
) {
  const assets = useUniverseAssets();

  // The halo derivation is memoized on the authored-truth signature (never
  // per render, never per frame — the PD-3 cost boundary). The authored ids
  // are rebuilt FROM the key string so the dependency list is honest: the key
  // and the loaded asset are the only inputs the derivation reads.
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
  const stubKey = useMemo(() => stubLayoutSignature(stubLayout), [stubLayout]);
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

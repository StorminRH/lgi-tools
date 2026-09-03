'use client';

import { resolveSystemLabel, type SystemLabel } from '../chain/labels';
import { useUniverseAssets } from '../chain/use-universe-assets';

export function useSystemLabel(systemId: number | null): SystemLabel | null {
  const assets = useUniverseAssets();
  if (systemId === null) return null;
  return resolveSystemLabel(systemId, assets?.systemInfo ?? null);
}

'use client';

import { useClientResource } from '@/lib/client-resource';
import {
  universeAssetsResource,
  wormholeCodexResource,
  type UniverseAssets,
  type WormholeCodex,
} from './universe-assets-client';

/** The universe assets, or null until they load; a failed load retries while anyone reads them. */
export function useUniverseAssets(): UniverseAssets | null {
  return useClientResource(universeAssetsResource).value;
}

/**
 * The codex once loaded, and whether loading it has failed so callers can say
 * so. The failure holds while a retry is in flight and clears on success.
 */
export function useWormholeCodexStatus(): {
  readonly codex: WormholeCodex | null;
  readonly failed: boolean;
} {
  const { value, failed } = useClientResource(wormholeCodexResource);
  return { codex: value, failed };
}

export function useWormholeCodex(): WormholeCodex | null {
  return useClientResource(wormholeCodexResource).value;
}

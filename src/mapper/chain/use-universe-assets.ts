'use client';

import { useEffect, useState } from 'react';
import {
  loadUniverseAssets,
  type UniverseAssets,
} from '@/data/eve-data/universe-assets-client';

/**
 * The session-memoized directory, or `null` until it lands. A failure stays null, silently.
 *
 * The mapper's one directory hook: the Signature Editor resolves its destination
 * readout from the same session load the canvas labels from, rather than opening a second one.
 */
export function useUniverseAssets(): UniverseAssets | null {
  const [assets, setAssets] = useState<UniverseAssets | null>(null);

  useEffect(() => {
    let active = true;
    loadUniverseAssets().then(
      (loaded) => {
        if (active) setAssets(loaded);
      },
      () => {
        // HC-5: an unresolved label falls back to the system id rather than becoming an error or a
        // loading state. The loader resets its own memo on failure, so a later mount retries.
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return assets;
}

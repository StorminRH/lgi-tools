'use client';

import { useEffect, useState } from 'react';
import {
  loadUniverseAssets,
  type UniverseAssets,
} from '@/data/eve-data/universe-assets-client';

export function useUniverseAssets(): UniverseAssets | null {
  const [assets, setAssets] = useState<UniverseAssets | null>(null);

  useEffect(() => {
    let active = true;
    loadUniverseAssets().then(
      (loaded) => {
        if (active) setAssets(loaded);
      },
      () => {
        // HC-5: labels fall back to system id. The next mount retries.
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return assets;
}

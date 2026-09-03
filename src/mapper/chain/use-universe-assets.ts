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
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return assets;
}

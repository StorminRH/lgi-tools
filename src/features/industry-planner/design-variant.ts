'use client';

import { useEffect } from 'react';
import { createClientStore, useClientStore } from '@/lib/client-store';

/** Review scaffold: the three research designs share one tree until one is picked. */
export type DesignVariant = 'ledger' | 'cards' | 'analyst';

const VARIANTS: readonly DesignVariant[] = ['ledger', 'cards', 'analyst'];
const STORAGE_KEY = 'lgi:industry:design';
const designStore = createClientStore<DesignVariant>('ledger');

export function useDesignVariant(): DesignVariant {
  const variant = useClientStore(designStore);
  useEffect(() => {
    const t = setTimeout(() => {
      const fromUrl = new URLSearchParams(window.location.search).get('design');
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const next = VARIANTS.find((v) => v === fromUrl) ?? VARIANTS.find((v) => v === stored);
      if (next !== undefined) {
        window.localStorage.setItem(STORAGE_KEY, next);
        designStore.set(next);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  return variant;
}

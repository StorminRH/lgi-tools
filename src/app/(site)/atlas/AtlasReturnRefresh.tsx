'use client';

import { useEffect, useEffectEvent, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { listenForAtlasReturn } from '@/features/maps/atlas-return-refresh';

export function AtlasReturnRefresh() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const refresh = useEffectEvent(() => {
    if (isPending) return false;
    startTransition(() => router.refresh());
    return true;
  });

  useEffect(() => listenForAtlasReturn({ document, window, now: Date.now, refresh }), []);
  return null;
}

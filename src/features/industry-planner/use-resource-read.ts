'use client';

import { useEffect } from 'react';
import { createResourceRead } from './resource-read';

// Thin React lifecycle shell around the tested resource policy. Callers express
// refetch dependencies by memoizing `read`/`onData`; cleanup always cancels the
// previous instance before React starts the next one.
export function useResourceRead<T>(
  read: (signal: AbortSignal) => Promise<T | null>,
  opts: { enabled: boolean; onData: (data: T) => void },
): void {
  const { enabled, onData } = opts;
  useEffect(() => {
    if (!enabled) return;
    const resource = createResourceRead({ read, onData });
    void resource.start();
    return resource.cancel;
  }, [enabled, onData, read]);
}

'use client';

import { useEffect } from 'react';
import { createResourceRead } from './resource-read';

export function useResourceRead<T>(
  read: (signal: AbortSignal) => Promise<T | null>,
  opts: { enabled: boolean; onData: (data: T) => void; refreshKey?: number },
): void {
  const { enabled, onData, refreshKey } = opts;
  useEffect(() => {
    if (!enabled) return;
    const resource = createResourceRead({ read, onData });
    void resource.start();
    return resource.cancel;
  }, [enabled, onData, read, refreshKey]);
}

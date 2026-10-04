'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const SETTLE_MS = 260;

/**
 * The card the pointer has settled on. Passing over cards on the way to
 * another lights nothing; a card held for a moment lights its chain, and
 * leaving it lets the chain fade.
 */
export function useSettledHover(): [number | null, (typeId: number, entering: boolean) => void] {
  const [settled, setSettled] = useState<number | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(pending.current), []);
  const onHover = useCallback((typeId: number, entering: boolean) => {
    clearTimeout(pending.current);
    if (entering) pending.current = setTimeout(() => setSettled(typeId), SETTLE_MS);
    else setSettled((shown) => (shown === typeId ? null : shown));
  }, []);
  return [settled, onHover];
}

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const ScannerScrollEpochContext = createContext<{
  readonly epoch: number;
  readonly bump: () => void;
  readonly register: (open: boolean) => void;
}>({ epoch: 0, bump: () => undefined, register: () => undefined });

/** Bumps a generation counter when the scanner list scrolls so open popups can close. */
export function ScannerScrollEpochProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [epoch, setEpoch] = useState(0);
  const openCount = useRef(0);
  const register = useCallback((open: boolean) => {
    openCount.current += open ? 1 : -1;
  }, []);
  const bump = useCallback(() => {
    if (openCount.current <= 0) return;
    setEpoch((current) => current + 1);
  }, []);
  const value = useMemo(
    () => ({ epoch, bump, register }),
    [epoch, bump, register],
  );
  return (
    <ScannerScrollEpochContext.Provider value={value}>
      {children}
    </ScannerScrollEpochContext.Provider>
  );
}

/** Increments the scanner scroll generation. Call from the list scroller. */
export function useScannerScrollBump(): () => void {
  return useContext(ScannerScrollEpochContext).bump;
}

/** Controlled popup open state that drops closed whenever the scanner list scrolls. */
export function useCloseOnScannerScroll(): {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
} {
  const { epoch, register } = useContext(ScannerScrollEpochContext);
  const [open, setOpen] = useState(false);
  const [prevEpoch, setPrevEpoch] = useState(epoch);
  if (epoch !== prevEpoch) {
    setPrevEpoch(epoch);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    register(true);
    return () => register(false);
  }, [open, register]);
  return { open, onOpenChange: setOpen };
}

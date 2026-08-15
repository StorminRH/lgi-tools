'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const ScannerScrollEpochContext = createContext<{
  readonly epoch: number;
  readonly bump: () => void;
}>({ epoch: 0, bump: () => undefined });

/** Bumps a generation counter when the scanner list scrolls so open popups can close. */
export function ScannerScrollEpochProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [epoch, setEpoch] = useState(0);
  const bump = useCallback(() => {
    setEpoch((current) => current + 1);
  }, []);
  const value = useMemo(() => ({ epoch, bump }), [epoch, bump]);
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
  const { epoch } = useContext(ScannerScrollEpochContext);
  const [open, setOpen] = useState(false);
  const [prevEpoch, setPrevEpoch] = useState(epoch);
  if (epoch !== prevEpoch) {
    setPrevEpoch(epoch);
    setOpen(false);
  }
  return { open, onOpenChange: setOpen };
}

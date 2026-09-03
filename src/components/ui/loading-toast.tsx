'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toast } from '@/components/ui/toast';

interface LoadingToastContextValue {
  acquire: (token: string) => void;
  release: (token: string) => void;
}

const LoadingToastContext = createContext<LoadingToastContextValue | null>(null);

const SYNC_TOAST_ID = 'lgi-sync';

const SYNC_DONE_MS = 500;

export function LoadingToastProvider({ children }: { children: ReactNode }) {

  const tokens = useRef<Set<string>>(new Set());
  const [count, setCount] = useState(0);

  const acquire = useCallback((token: string) => {
    tokens.current.add(token);
    setCount(tokens.current.size);
  }, []);

  const release = useCallback((token: string) => {
    tokens.current.delete(token);
    setCount(tokens.current.size);
  }, []);

  const ctx = useMemo<LoadingToastContextValue>(
    () => ({ acquire, release }),
    [acquire, release],
  );

  useSyncToast(count > 0);

  return (
    <LoadingToastContext.Provider value={ctx}>
      {children}
    </LoadingToastContext.Provider>

  );
}

export function useLoadingToast(active: boolean): void {
  const ctx = useContext(LoadingToastContext);
  const token = useId();
  useEffect(() => {
    if (!ctx || !active) return;
    ctx.acquire(token);
    return () => ctx.release(token);
  }, [ctx, active, token]);
}

function useSyncToast(active: boolean): void {
  const wasActive = useRef(false);
  useEffect(() => {
    if (active && !wasActive.current) {
      toast.loading('> syncing…', { id: SYNC_TOAST_ID, duration: Infinity });
    } else if (!active && wasActive.current) {
      toast.success('> synced', { id: SYNC_TOAST_ID, duration: SYNC_DONE_MS });
    }
    wasActive.current = active;
  }, [active]);

  useEffect(() => () => {
    toast.dismiss(SYNC_TOAST_ID);
  }, []);
}

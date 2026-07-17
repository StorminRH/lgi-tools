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

// The single sitewide "something dynamic is loading" affordance. Surfaces don't
// render their own toast — they register with this provider via
// useLoadingToast(active). The provider holds a Set of opaque tokens and treats
// the affordance as active while the set is non-empty; a token-set (not an
// integer counter) is idempotent under React's double-mounted effects and
// unmount-during-flight, so concurrent loaders can't desync the count. The hook
// suits any component that already holds a boolean flag (Convex `syncing`, the
// planner's `refreshing`): it acquires a token on true/mount and releases on
// false/unmount.
//
// The VIEW is sonner (src/components/ui/toast.tsx): one keyed toast driven off
// the aggregate active state — a persistent loading toast on 0→1, swapped to
// "Synced" on →0 (which then auto-dismisses). sonner owns enter/exit/stacking on
// a viewport-fixed portal, so the prior hand-rolled strip's scroll-detach bug and
// its timing machinery are both gone by construction (see
// docs/OOB.3_TOAST_DIAGNOSIS.md). <Toaster> mounts once in the root layout.

interface LoadingToastContextValue {
  acquire: (token: string) => void;
  release: (token: string) => void;
}

const LoadingToastContext = createContext<LoadingToastContextValue | null>(null);

// Stable id so the loading → synced lifecycle is ONE toast updated in place,
// never a second toast stacked on the first.
const SYNC_TOAST_ID = 'lgi-sync';
// How long the "synced" confirmation stays before it auto-dismisses. This MUST be
// set explicitly: updating the loading toast (created with duration: Infinity) to
// success by id merges over the existing toast WITHOUT resetting its duration, so
// without this the success inherits Infinity and never disappears (it would even
// persist across client navigations, since the toaster lives in the root layout).
const SYNC_DONE_MS = 500;

export function LoadingToastProvider({ children }: { children: ReactNode }) {
  // The live registration set, mutated synchronously in acquire/release; the
  // render only cares whether it's non-empty, so we publish the size as state.
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

  // Drive the sonner toast off whether any loader is registered.
  useSyncToast(count > 0);

  return (
    <LoadingToastContext.Provider value={ctx}>
      {children}
    </LoadingToastContext.Provider>
  );
}

/**
 * Register a loader for as long as `active` is true (and until unmount). The
 * canonical entry point for components that already hold a boolean flag. No-op
 * on the server (the effect doesn't run) and a no-op outside a provider (ctx is
 * null), so a beacon in a test or storybook can't throw. useId gives a stable,
 * instance-unique token without a useRef(randomUUID) dance.
 */
export function useLoadingToast(active: boolean): void {
  const ctx = useContext(LoadingToastContext);
  const token = useId();
  useEffect(() => {
    if (!ctx || !active) return;
    ctx.acquire(token);
    return () => ctx.release(token);
  }, [ctx, active, token]);
}

// Fire ONE keyed sonner toast on the aggregate active-state transitions: a
// persistent loading toast on 0→1, swapped in place to "Synced" on →0 (sonner
// auto-dismisses the success). Only the external `toast.*` call + a ref write
// live in the effect — no setState — so the set-state-in-effect lint stays quiet,
// and a Strict-mode double-mount is a no-op (it starts inactive). The token-Set
// already absorbs double-mount desync, so this driver just watches the edge.
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

  // Safety net (mount/unmount only): if the provider ever unmounts mid-sync — in
  // practice just a dev HMR cycle on the root layout, since it's persistent in
  // prod — dismiss the Infinity-duration loading toast so it can't orphan into
  // the next mount. Kept in its own [] effect so it fires on unmount, not on
  // every `active` transition.
  useEffect(() => () => {
    toast.dismiss(SYNC_TOAST_ID);
  }, []);
}

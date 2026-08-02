'use client';

// Worker-backed LayoutKernel with in-process fallback.
//
// Construction throw → immediate fallback. A post-construction
// `error`/`messageerror` (a chunk that fails to load or evaluate never rejects
// the constructor) logs once, marks the worker dead, and settles outstanding
// and subsequent requests through the same `compassKernel` seam — identical
// deterministic output either way, so the map can never sit silently empty
// behind a healthy subscription.
//
// Posted-key / latest-wins sequencing lives in `use-map-chain` via
// `kernel-requests.ts`. This hook only correlates worker replies to the call
// that posted them and owns degradation.
import { useCallback, useEffect, useRef } from 'react';
import type { ChainPosition } from '../chain/intents';
import { compassKernel } from './compass';
import {
  DEFAULT_LAYOUT_CONFIG,
  type LayoutConfig,
  type LayoutFacts,
  type LayoutKernel,
} from './layout-contract';
import type {
  LayoutWorkerRequest,
  LayoutWorkerResponse,
} from './layout.worker';

/**
 * Rejection message for requests torn down by unmount. Expected lifecycle —
 * StrictMode's simulated remount hits it on every dev mount — so consumers
 * drop it silently instead of logging an error.
 */
export const LAYOUT_KERNEL_TEARDOWN = 'layout kernel teardown';

type Pending = {
  readonly facts: LayoutFacts;
  readonly config: LayoutConfig;
  readonly resolve: (positions: ReadonlyMap<number, ChainPosition>) => void;
  readonly reject: (error: unknown) => void;
};

function settleInProcess(
  pendingRef: { current: Map<number, Pending> },
  requestId: number,
  pending: Pending,
): void {
  void compassKernel(pending.facts, pending.config).then(
    (positions) => {
      pendingRef.current.delete(requestId);
      pending.resolve(positions);
    },
    (error: unknown) => {
      pendingRef.current.delete(requestId);
      pending.reject(error);
    },
  );
}

/**
 * Worker-backed LayoutKernel with in-process fallback; stable identity per mount.
 *
 * Consumed by `useMapChain` internally — callers never construct workers.
 */
export function useLayoutKernel(): LayoutKernel {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<number, Pending>>(new Map());
  const nextIdRef = useRef(1);
  const deadRef = useRef(false);
  const fallbackOnlyRef = useRef(false);

  useEffect(() => {
    // Copied so the cleanup rejects exactly the requests pending at teardown.
    const pending = pendingRef.current;
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL('./layout.worker.ts', import.meta.url));
    } catch (error) {
      console.error('layout worker construction failed; using in-process kernel', error);
      fallbackOnlyRef.current = true;
      return;
    }

    workerRef.current = worker;
    // A fresh worker is healthy; clear any death recorded by a previous mount
    // (StrictMode remount or route remount) so we do not leave a live worker idle
    // while every request permanently takes the in-process branch.
    deadRef.current = false;

    worker.onmessage = (event: MessageEvent<LayoutWorkerResponse>) => {
      const response = event.data;
      const pending = pendingRef.current.get(response.requestId);
      if (pending === undefined) return;

      if (response.kind === 'error') {
        console.error('layout worker kernel rejection', response.message);
        pendingRef.current.delete(response.requestId);
        pending.reject(new Error(response.message));
        return;
      }

      pendingRef.current.delete(response.requestId);
      pending.resolve(response.positions);
    };

    const die = (error: Event) => {
      if (deadRef.current) return;
      deadRef.current = true;
      console.error('layout worker failed; degrading to in-process kernel', error);
      workerRef.current = null;
      try {
        worker?.terminate();
      } catch {
        // Already dead.
      }
      for (const [requestId, pending] of [...pendingRef.current.entries()]) {
        settleInProcess(pendingRef, requestId, pending);
      }
    };

    worker.addEventListener('error', die);
    worker.addEventListener('messageerror', die);

    return () => {
      worker?.removeEventListener('error', die);
      worker?.removeEventListener('messageerror', die);
      worker?.terminate();
      workerRef.current = null;
      for (const entry of pending.values()) {
        entry.reject(new Error(LAYOUT_KERNEL_TEARDOWN));
      }
      pending.clear();
    };
  }, []);

  return useCallback<LayoutKernel>((facts, config = DEFAULT_LAYOUT_CONFIG) => {
    if (fallbackOnlyRef.current || deadRef.current || workerRef.current === null) {
      return compassKernel(facts, config);
    }

    const requestId = nextIdRef.current;
    nextIdRef.current += 1;

    return new Promise((resolve, reject) => {
      const pending: Pending = { facts, config, resolve, reject };
      pendingRef.current.set(requestId, pending);
      const request: LayoutWorkerRequest = { requestId, facts, config };
      try {
        // Non-null by the guard above; the closure runs outside render, where
        // refs are legal to read.
        workerRef.current!.postMessage(request);
      } catch (error) {
        console.error('layout worker postMessage failed; using in-process kernel', error);
        deadRef.current = true;
        workerRef.current = null;
        settleInProcess(pendingRef, requestId, pending);
      }
    });
  }, []);
}

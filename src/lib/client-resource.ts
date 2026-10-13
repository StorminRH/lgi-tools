import { useSyncExternalStore } from 'react';
import { createClientStore } from './client-store';

export interface ResourceState<T> {
  readonly value: T | null;
  /** A load failed and none has succeeded since; a retry in flight keeps it set. */
  readonly failed: boolean;
}

export interface ClientResource<T> {
  /** The value, read once and shared. A rejected read is forgotten, so the next call reads again. */
  readonly load: () => Promise<T>;
  readonly get: () => ResourceState<T>;
  /**
   * Listens for the value. A reader that subscribes while nothing is loaded,
   * loading or waiting to retry starts a load; a failed load retries on one
   * shared timer while anyone is subscribed, and the last to leave clears it.
   */
  readonly subscribe: (listener: () => void) => () => void;
  readonly serverValue: ResourceState<T>;
}

const RESOURCE_RETRY_MS = 15_000;

const UNLOADED: ResourceState<never> = { value: null, failed: false };

function noop(): void {}

/**
 * A page-wide value read once on demand, such as an index or asset bundle.
 * Every reader shares one load and hears its outcome through a client store,
 * so a reader mounted after the load has the value on its first render, and
 * the server and hydration render `serverValue`. Nothing loads until a reader
 * subscribes or a caller asks, so the server never loads.
 */
export function createClientResource<T>(read: () => Promise<T>): ClientResource<T> {
  const store = createClientStore<ResourceState<T>>(UNLOADED);
  let pending: Promise<T> | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let subscribers = 0;

  function armRetry() {
    if (subscribers === 0 || retry !== undefined) return;
    retry = setTimeout(() => {
      retry = undefined;
      load().catch(noop);
    }, RESOURCE_RETRY_MS);
  }

  function disarmRetry() {
    clearTimeout(retry);
    retry = undefined;
  }

  function load(): Promise<T> {
    pending ??= read().then(
      (value) => {
        // A caller that loaded while a retry waited makes the retry moot.
        disarmRetry();
        store.set({ value, failed: false });
        return value;
      },
      (error: unknown) => {
        pending = null;
        if (!store.get().failed) store.set({ value: null, failed: true });
        armRetry();
        throw error;
      },
    );
    return pending;
  }

  return {
    load,
    get: store.get,
    subscribe(listener) {
      const unsubscribe = store.subscribe(listener);
      subscribers += 1;
      if (pending === null && retry === undefined) load().catch(noop);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        unsubscribe();
        subscribers -= 1;
        if (subscribers === 0) disarmRetry();
      };
    },
    serverValue: UNLOADED,
  };
}

function subscribeToNothing(): () => void {
  return noop;
}

/** The resource's state; a disabled reader neither loads nor listens. */
export function useClientResource<T>(resource: ClientResource<T>, enabled = true): ResourceState<T> {
  return useSyncExternalStore(
    enabled ? resource.subscribe : subscribeToNothing,
    resource.get,
    () => resource.serverValue,
  );
}

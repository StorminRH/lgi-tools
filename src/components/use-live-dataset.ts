'use client';

import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import type { z } from 'zod';
import { apiFetch } from '@/transport/api-client';
import type { EndpointContract, JsonCodec, OutcomeOf } from '@/transport/endpoint';
import { getOrInsertComputed } from '@/lib/array';
import { shareInFlight } from '@/lib/memoize';
import {
  type LiveResponse,
  loadFailureStep,
  neverCold,
  RECONCILE_SCHEDULE,
  reconcileDelay,
} from '@/lib/live-dataset';
import { useNow } from '@/lib/use-now';
import { isCurrentReadIdentity, type ReadIdentity, useReadIdentity } from '@/platform/auth/read-identity';
import { createRememberedRead, type RememberedRead, useRememberedRead } from './remembered-read';

const TICK_MS = 30_000;
const RETRY_DELAY_MS = 4_000;

/** What every live-dataset hook hands its consumers besides the derived rows. */
export interface LiveDatasetState {
  names: Record<string, string>;
  now: number;
  loading: boolean;
  failed: boolean;
  /** Starts the read again after it failed. */
  retry: () => void;
}

/** What besides a refresh keeps a dataset cold is keyed by a primitive, so the loop restarts only when it changes. */
export type ColdKey = string | number | boolean;

export type LiveGet<TResponse extends LiveResponse> = EndpointContract<null, { 200: JsonCodec<TResponse> }> & {
  method: 'GET';
};

/** A POST contract with its body, and the key the remembered entry lives under: a different key draws nothing until its own read lands. */
export interface LivePost<TRequest extends z.ZodTypeAny, TResponse extends LiveResponse> {
  endpoint: EndpointContract<TRequest, { 200: JsonCodec<TResponse> }> & { method: 'POST' };
  body: z.input<TRequest>;
  key: string;
}

export type LiveRead<TResponse extends LiveResponse> = LiveGet<TResponse> | LivePost<z.ZodTypeAny, TResponse>;

interface RememberedEntry<TResponse> {
  key: string;
  response: TResponse;
}

// One remembered entry per endpoint, shared by every reader of it.
const memories = new Map<string, RememberedRead<RememberedEntry<unknown>>>();

function memoryFor<TResponse>(path: string): RememberedRead<RememberedEntry<TResponse>> {
  return getOrInsertComputed(memories, path, () => createRememberedRead<RememberedEntry<unknown>>()) as RememberedRead<
    RememberedEntry<TResponse>
  >;
}

// Requests under way, per session scope: a second mount (React's dev double
// mount included), another reader of the same read, or a re-check on the same
// schedule joins the request already in flight instead of sending its own.
// Each reader only ignores a result it no longer wants; nothing is aborted,
// and the entry goes once the request settles, so the next check asks again.
const inFlight = new WeakMap<ReadIdentity, Map<string, Promise<unknown>>>();

function inFlightFor(identity: ReadIdentity): Map<string, Promise<unknown>> {
  const requests = inFlight.get(identity) ?? new Map<string, Promise<unknown>>();
  inFlight.set(identity, requests);
  return requests;
}

/**
 * One request per read: the endpoint, the remembered entry's key, and the
 * cold key, so a reader whose cold key moved on (a save bumping a revision)
 * never joins a request sent before it.
 */
function requestKey(path: string, entryKey: string, coldKey: ColdKey): string {
  return `${path}\n${entryKey}\n${String(coldKey)}`;
}

function isPost<TResponse extends LiveResponse>(read: LiveRead<TResponse>): read is LivePost<z.ZodTypeAny, TResponse> {
  return 'endpoint' in read;
}

function readLive<TResponse extends LiveResponse>(read: LiveRead<TResponse>): Promise<OutcomeOf<LiveGet<TResponse>>> {
  return isPost(read) ? apiFetch(read.endpoint, { body: read.body }) : apiFetch(read);
}

/**
 * The stored copy of an EVE dataset, checked back for newer data. The server
 * answers at once with what it holds and says `refreshing` when it started an
 * ESI refresh behind that answer; the hook then re-reads on a short backoff
 * until the refresh has landed (the store answers unchanged until CCP's
 * expiry, so each re-read is cheap), or until `isCold` finds nothing missing.
 */
export function useLiveDataset<TResponse extends LiveResponse, TKey extends ColdKey = true>(
  read: LiveGet<TResponse>,
  coldKey?: TKey,
  isCold?: (response: TResponse, key: TKey) => boolean,
  reconcileSchedule?: readonly number[],
): { response: TResponse | null } & Omit<LiveDatasetState, 'names'>;
export function useLiveDataset<TResponse extends LiveResponse, TRequest extends z.ZodTypeAny, TKey extends ColdKey = true>(
  read: LivePost<TRequest, TResponse>,
  coldKey?: TKey,
  isCold?: (response: TResponse, key: TKey) => boolean,
  reconcileSchedule?: readonly number[],
): { response: TResponse | null } & Omit<LiveDatasetState, 'names'>;
export function useLiveDataset<TResponse extends LiveResponse, TKey extends ColdKey>(
  read: LiveRead<TResponse>,
  // Besides a refresh under way, what else keeps the data cold: a dataset
  // whose rows can be missing passes its own test and the key it needs.
  coldKey: ColdKey = true,
  isCold: (response: TResponse, key: TKey) => boolean = neverCold,
  // Refetch delays while the data is still cold. Pass a module-level array:
  // it is an effect dependency.
  reconcileSchedule: readonly number[] = RECONCILE_SCHEDULE,
): { response: TResponse | null } & Omit<LiveDatasetState, 'names'> {
  // The last response outlives this component, so a page that mounts again
  // draws it at once and refreshes quietly. Once data is on screen, a later
  // failure keeps it instead of replacing it with the failure line.
  const post = isPost(read);
  const path = post ? read.endpoint.path : read.path;
  const entryKey = post ? read.key : '';
  const memory = memoryFor<TResponse>(path);
  const entry = useRememberedRead(memory);
  const response = entry !== null && entry.key === entryKey ? entry.response : null;
  const identity = useReadIdentity();
  const [failure, setFailure] = useState<typeof identity>(null);
  const failed = identity !== null && failure === identity;
  // Bumped by retry so the load effect runs again from the start.
  const [attempts, setAttempts] = useState(0);
  // The body is read when the request is made, so the loop restarts on the
  // entry key alone rather than on every render's body object.
  const fetchLive = useEffectEvent(() => readLive(read));

  useEffect(() => {
    if (identity === null) return;
    let cancelled = false;
    let attempt = 0;
    let retried = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delay: number) => {
      timer = setTimeout(() => void load(), delay);
    };

    // A failed fetch must still settle the dataset: one delayed retry, then
    // `failed`, so consumers can swap their loading state for an error line.
    const onFailure = () => {
      const step = loadFailureStep(memory.get()?.key === entryKey, retried);
      if (step === 'retry') {
        retried = true;
        schedule(RETRY_DELAY_MS);
      } else if (step === 'fail') {
        setFailure(identity);
      }
    };

    const load = async () => {
      const shared = shareInFlight(inFlightFor(identity), requestKey(path, entryKey, coldKey), fetchLive);
      const result = (await shared) as Awaited<ReturnType<typeof fetchLive>>;
      if (cancelled || !isCurrentReadIdentity(identity)) return;
      if (!result.ok) {
        onFailure();
        return;
      }
      memory.set({ key: entryKey, response: result.data }, identity);
      setFailure(null);
      const delay = reconcileDelay(attempt, result.data, coldKey as TKey, isCold, reconcileSchedule);
      if (delay !== null) {
        attempt += 1;
        schedule(delay);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [path, entryKey, memory, identity, coldKey, isCold, reconcileSchedule, attempts]);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempts((n) => n + 1);
  }, []);

  const now = useNow(TICK_MS);

  return { response, now, loading: response === null && !failed, failed, retry };
}

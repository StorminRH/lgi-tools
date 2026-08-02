// Pure request-sequencing for the layout worker bridge.
//
// The merge pipeline posts layout work keyed by chain signature plus a layout
// revision. Re-renders with fresh-but-equal subscription objects must never
// cancel or repost in-flight work; only a newer key supersedes. Staleness is
// decided by comparing a reply's request id against the latest posted id —
// never by effect-cleanup identity. A terminal-without-apply failure resets
// the posted key so the next change retries. Worker health is deliberately NOT
// tracked here: `use-layout-kernel.ts` owns the worker and therefore owns
// degradation; this model sequences requests whatever engine answers them.

/** The sequencing state one live map's worker bridge carries. */
export interface KernelRequestState {
  /** Next monotonic id to assign on post. Starts at 1. */
  readonly nextRequestId: number;
  /** The key of the in-flight or last-applied post; `null` means nothing is posted. */
  readonly postedKey: string | null;
  /** The most recently posted request id, or `null` before the first post. */
  readonly latestPostedId: number | null;
}

/** The idle sequencing state for a freshly mounted bridge. */
export function initialKernelRequestState(): KernelRequestState {
  return {
    nextRequestId: 1,
    postedKey: null,
    latestPostedId: null,
  };
}

/** Result of attempting to post work for a key. */
export type PostResult =
  | { readonly kind: 'posted'; readonly state: KernelRequestState; readonly requestId: number }
  | { readonly kind: 'skipped'; readonly state: KernelRequestState };

/**
 * Assigns the next monotonic id and advances the posted key when `key` is new.
 *
 * An unchanged key never reposts — pointer moves during a drag and fresh
 * subscription object identities must not cancel or duplicate in-flight work.
 */
export function postRequest(state: KernelRequestState, key: string): PostResult {
  if (state.postedKey === key) {
    return { kind: 'skipped', state };
  }
  const requestId = state.nextRequestId;
  return {
    kind: 'posted',
    requestId,
    state: {
      ...state,
      nextRequestId: requestId + 1,
      postedKey: key,
      latestPostedId: requestId,
    },
  };
}

/**
 * True when a reply's request id is still the latest posted id — the only
 * acceptance criterion. Superseded replies lose and are dropped.
 */
export function acceptReply(state: KernelRequestState, requestId: number): boolean {
  return state.latestPostedId === requestId;
}

/**
 * Terminal without apply (kernel rejection or fallback failure for this id):
 * resets the posted key when the failed id is still latest, so the next change
 * retries. A superseded failure leaves sequencing alone.
 */
export function failRequest(
  state: KernelRequestState,
  requestId: number,
): KernelRequestState {
  if (state.latestPostedId !== requestId) return state;
  return { ...state, postedKey: null };
}

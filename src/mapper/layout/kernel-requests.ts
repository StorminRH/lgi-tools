export interface KernelRequestState {
  readonly nextRequestId: number;
  readonly postedKey: string | null;
  readonly latestPostedId: number | null;
}

export function initialKernelRequestState(): KernelRequestState {
  return {
    nextRequestId: 1,
    postedKey: null,
    latestPostedId: null,
  };
}

export type PostResult =
  | { readonly kind: 'posted'; readonly state: KernelRequestState; readonly requestId: number }
  | { readonly kind: 'skipped'; readonly state: KernelRequestState };

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

export function acceptReply(state: KernelRequestState, requestId: number): boolean {
  return state.latestPostedId === requestId;
}

export function failRequest(
  state: KernelRequestState,
  requestId: number,
): KernelRequestState {
  if (state.latestPostedId !== requestId) return state;
  return { ...state, postedKey: null };
}

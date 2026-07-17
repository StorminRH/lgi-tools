/**
 * The per-character online state the portrait dot renders, derived from the live
 * Convex projection (api.onlineStatus.forViewer). A character with no online doc
 * yet — unfetched, errored-first, or lacking the read_online scope (not relinked)
 * — is absent from the projection, so its `online` is undefined and the dot stays
 * hidden (`unknown`), never a wrong "offline". Pure so the mapping is unit-tested
 * without a Convex runtime.
 */
export type OnlineState = 'online' | 'offline' | 'unknown';

export function deriveOnlineState(online: boolean | undefined): OnlineState {
  if (online === undefined) return 'unknown';
  return online ? 'online' : 'offline';
}

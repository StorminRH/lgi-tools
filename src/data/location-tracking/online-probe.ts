// The location sync's online-probe decision (pure half). The probe answers
// "is this pilot logged into EVE?" — the pause/resume signal that lets the
// engine drop a tracked-but-offline subject to the ~60s probe cadence and
// resume the fast location loop on the next login. ESI caches the /online
// answer for ~60s, so the held flag is reused inside its window (zero ESI)
// and re-read conditionally past it; tracked pilots therefore never bill more
// than ~1/min of /online reads regardless of the 5s location cadence.
// Runtime-light — the Convex action imports this module.

/** The held per-character probe state (a characterLocationOnline row's payload). */
export interface HeldOnlineState {
  online: boolean;
  etagOnline: string | null;
  onlineExpiresAt: number;
}

/**
 * What the probe should do for one character this run: trust the held answer
 * inside its cache window, or re-read (conditionally, with the held ETag).
 */
export type OnlineProbeDecision =
  | { kind: 'held'; online: boolean }
  | { kind: 'read'; etagOnline: string | null };

/** Decides reuse-vs-read for one character's held probe state at the given clock. */
export function decideOnlineProbe(
  held: HeldOnlineState | undefined,
  now: number,
): OnlineProbeDecision {
  if (held !== undefined && held.onlineExpiresAt > now) {
    return { kind: 'held', online: held.online };
  }
  return { kind: 'read', etagOnline: held?.etagOnline ?? null };
}

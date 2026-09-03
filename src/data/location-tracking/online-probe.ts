export interface HeldOnlineState {
  online: boolean;
  etagOnline: string | null;
  onlineExpiresAt: number;
}

export type OnlineProbeDecision =
  | { kind: 'held'; online: boolean }
  | { kind: 'read'; etagOnline: string | null };

export function decideOnlineProbe(
  held: HeldOnlineState | undefined,
  now: number,
): OnlineProbeDecision {
  if (held !== undefined && held.onlineExpiresAt > now) {
    return { kind: 'held', online: held.online };
  }
  return { kind: 'read', etagOnline: held?.etagOnline ?? null };
}

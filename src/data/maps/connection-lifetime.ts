import type { WormholeLifeStage } from '@/data/eve-data/wormhole-contract';

const HOUR_MS = 60 * 60 * 1000;

export interface ConnectionDeathWindow {
  readonly earliestAt: number;
  readonly latestAt: number;
}

export type LifetimeDisplay =
  | {
      readonly kind: 'range';
      readonly earliestRemainingMs: number;
      readonly latestRemainingMs: number;
    }
  | {
      readonly kind: 'expired';
      readonly earliestRemainingMs: 0;
      readonly latestRemainingMs: 0;
    };

const LIFE_STAGE_REMAINING_MS = {
  under_1_day: { min: 4 * HOUR_MS, max: 24 * HOUR_MS },
  under_4_hours: { min: HOUR_MS, max: 4 * HOUR_MS },
  under_1_hour: { min: 0, max: HOUR_MS },
  expired: { min: 0, max: 0 },
} as const satisfies Record<
  WormholeLifeStage,
  { readonly min: number; readonly max: number }
>;

export function deathWindowFrom(
  earliestAt: number | null | undefined,
  latestAt: number | null | undefined,
): ConnectionDeathWindow | null {
  return typeof earliestAt === 'number' &&
    Number.isFinite(earliestAt) &&
    typeof latestAt === 'number' &&
    Number.isFinite(latestAt) &&
    earliestAt <= latestAt
    ? { earliestAt, latestAt }
    : null;
}

export function deathWindowForReport(
  bucket: WormholeLifeStage,
  observedAt: number,
  lifetimeMinutes: number | null,
): ConnectionDeathWindow {
  const interval = LIFE_STAGE_REMAINING_MS[bucket];
  const lifetimeCap =
    lifetimeMinutes !== null &&
    Number.isFinite(lifetimeMinutes) &&
    lifetimeMinutes >= 0
      ? lifetimeMinutes * 60 * 1000
      : Number.POSITIVE_INFINITY;
  const maxRemaining = Math.min(interval.max, lifetimeCap);
  const minRemaining = Math.min(interval.min, maxRemaining);

  return {
    earliestAt: observedAt + minRemaining,
    latestAt: observedAt + maxRemaining,
  };
}

export function intersectOrReset(
  stored: ConnectionDeathWindow | null,
  next: ConnectionDeathWindow,
): ConnectionDeathWindow {
  if (stored === null) return next;
  const intersection = {
    earliestAt: Math.max(stored.earliestAt, next.earliestAt),
    latestAt: Math.min(stored.latestAt, next.latestAt),
  };
  return intersection.earliestAt <= intersection.latestAt ? intersection : next;
}

export function lifetimeDisplay(
  window: ConnectionDeathWindow,
  now: number,
): LifetimeDisplay {
  const earliestRemainingMs = Math.max(0, window.earliestAt - now);
  const latestRemainingMs = Math.max(0, window.latestAt - now);
  if (latestRemainingMs === 0) {
    return { kind: 'expired', earliestRemainingMs: 0, latestRemainingMs: 0 };
  }
  return { kind: 'range', earliestRemainingMs, latestRemainingMs };
}

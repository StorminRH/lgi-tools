import {
  remainingMassAfterTravel,
  type ConnectionMassState,
  type WormholeSizeClass,
} from '@/data/eve-data/wormhole-contract';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import { lifetimeDeathWindow } from '@/data/maps/connection-hallway';
import type { ConnectionLifetime } from '@/data/maps/connection-hallway';
import {
  lifetimeDisplay,
  type ConnectionDeathWindow,
} from '@/data/maps/connection-lifetime';
import type { ConnectionDetail } from '../chain/connection-detail';

export interface CodexPanelFacts {
  readonly totalMassKg: number;
  readonly maxJumpMassKg: number;
  readonly massRegenKg: number;
  readonly lifetimeMinutes: number;
  readonly sizeClass: WormholeSizeClass;
}

export type MassRowDisplay =
  | {
      readonly kind: 'range';
      readonly minKg: number;
      readonly maxKg: number;
      readonly label: string;
      readonly title: string;
    }
  | { readonly kind: 'regenerates'; readonly label: string }
  | { readonly kind: 'none' };

export type LifetimeRowDisplay =
  | { readonly kind: 'unset' }
  | {
      readonly kind: 'ceiling';
      readonly label: string;
      readonly title: string;
    }
  | {
      readonly kind: 'range';
      readonly label: string;
      readonly title: string;
    }
  | { readonly kind: 'expired'; readonly label: string };

const HOUR_MS = 60 * 60 * 1000;

export function isCodexSizeLocked(entry: WormholeCodexEntry | null): boolean {
  return entry !== null && entry.farSide === false;
}

export function codexPanelFacts(
  entry: WormholeCodexEntry | null,
): CodexPanelFacts | null {
  if (entry === null || entry.farSide) return null;
  return {
    totalMassKg: entry.totalMass,
    maxJumpMassKg: entry.maxJumpMass,
    massRegenKg: entry.massRegen,
    lifetimeMinutes: entry.lifetimeMinutes,
    sizeClass: entry.sizeClass,
  };
}

export function formatKilograms(kg: number): string {
  const absolute = Math.abs(kg);
  if (absolute >= 1_000_000_000) {
    return `${trimNumber(kg / 1_000_000_000)}B kg`;
  }
  if (absolute >= 1_000_000) {
    return `${trimNumber(kg / 1_000_000)}M kg`;
  }
  if (absolute >= 1_000) {
    return `${trimNumber(kg / 1_000)}k kg`;
  }
  return `${Math.round(kg)} kg`;
}

export function formatDurationBound(ms: number): string {
  if (ms <= 0) return '0h';
  if (ms < HOUR_MS) {
    const minutes = Math.max(1, Math.round(ms / 60_000));
    return `${minutes}m`;
  }
  const hours = ms / HOUR_MS;
  if (hours < 10) return `${trimNumber(hours)}h`;
  return `${Math.round(hours)}h`;
}

export function massRowDisplay(
  entry: WormholeCodexEntry | null,
  massState: ConnectionMassState | null,
  observedMassKg: number | null,
  observedMassAtStateKg: number | null,
): MassRowDisplay {
  if (entry === null) return { kind: 'none' };
  if (entry.farSide) return { kind: 'none' };
  if (entry.massRegen > 0) {
    return { kind: 'regenerates', label: 'Regenerates — no mass interval' };
  }
  const bounds = remainingMassAfterTravel(
    entry,
    massState,
    observedMassKg,
    observedMassAtStateKg,
  );
  if (bounds === null) return { kind: 'none' };
  return {
    kind: 'range',
    minKg: bounds.minKg,
    maxKg: bounds.maxKg,
    label: `${formatKilograms(bounds.minKg)}–${formatKilograms(bounds.maxKg)} (±10% spawn)`,
    title: `${bounds.minKg.toLocaleString()}–${bounds.maxKg.toLocaleString()} kg remaining`,
  };
}

type LifetimeSource =
  | { readonly kind: 'expired' }
  | {
      readonly kind: 'range';
      readonly earliestRemainingMs: number;
      readonly latestRemainingMs: number;
    }
  | { readonly kind: 'ceiling'; readonly remainingMs: number; readonly ceilingAt: number }
  | { readonly kind: 'unset' };

export type LifetimeConnection = Pick<ConnectionDetail, '_creationTime'> & {
  readonly lifetime: ConnectionLifetime;
};

function lifetimeSource(
  connection: LifetimeConnection,
  entry: WormholeCodexEntry | null,
  now: number,
): LifetimeSource {
  const window = storedDeathWindow(connection);
  if (window !== null) {
    const display = lifetimeDisplay(window, now);
    if (display.kind === 'expired') return { kind: 'expired' };
    return {
      kind: 'range',
      earliestRemainingMs: display.earliestRemainingMs,
      latestRemainingMs: display.latestRemainingMs,
    };
  }
  if (
    entry !== null &&
    !entry.farSide &&
    Number.isFinite(entry.lifetimeMinutes) &&
    entry.lifetimeMinutes >= 0
  ) {
    const ceilingAt =
      connection._creationTime + entry.lifetimeMinutes * 60_000;
    const remainingMs = Math.max(0, ceilingAt - now);
    if (remainingMs === 0) return { kind: 'expired' };
    return { kind: 'ceiling', remainingMs, ceilingAt };
  }
  return { kind: 'unset' };
}

export function lifetimeRowDisplay(
  connection: LifetimeConnection,
  entry: WormholeCodexEntry | null,
  now: number,
): LifetimeRowDisplay {
  const source = lifetimeSource(connection, entry, now);
  if (source.kind === 'expired') return { kind: 'expired', label: 'Expired' };
  if (source.kind === 'range') {
    return {
      kind: 'range',
      label: `~${formatDurationBound(source.earliestRemainingMs)}–${formatDurationBound(source.latestRemainingMs)}`,
      title: countdownTitle(source.earliestRemainingMs, source.latestRemainingMs),
    };
  }
  if (source.kind === 'ceiling') {
    return {
      kind: 'ceiling',
      label: `≤ ${formatDurationBound(source.remainingMs)}`,
      title: `Typed ceiling ${new Date(source.ceilingAt).toISOString()}`,
    };
  }
  return { kind: 'unset' };
}

export function lifetimeUpperBoundLabel(
  connection: LifetimeConnection,
  entry: WormholeCodexEntry | null,
  now: number,
): string | null {
  const source = lifetimeSource(connection, entry, now);
  if (source.kind === 'expired') return 'Expired';
  if (source.kind === 'range') return formatDurationBound(source.latestRemainingMs);
  if (source.kind === 'ceiling') return formatDurationBound(source.remainingMs);
  return null;
}

function storedDeathWindow(connection: {
  readonly lifetime: ConnectionLifetime;
}): ConnectionDeathWindow | null {
  return lifetimeDeathWindow(connection.lifetime);
}

function countdownTitle(earliestMs: number, latestMs: number): string {
  return `${formatDurationBound(earliestMs)}–${formatDurationBound(latestMs)} remaining`;
}

function trimNumber(value: number): string {
  return Number(value.toFixed(1)).toString();
}

import type { EsiStoreKey } from './types';

/**
 * CCP's daily downtime: ESI is switched off at about 10:55 UTC and the
 * published schedule has it back by 11:30. Inside that window, two status
 * reads in a row that come back 503 or 504, at least 25 s apart, halt every
 * ESI call until 11:30 and pages serve Neon. Outside the window no failure
 * ever halts anything, and timeouts, 502s, 420s, 429s and budget refusals
 * never count anywhere.
 */
const HALT_WINDOW_START_MINUTE = 10 * 60 + 55;
const HALT_WINDOW_END_MINUTE = 11 * 60 + 30;
export const DOWNTIME_FAILURE_GAP_MS = 25_000;

/** The `/status/` row carries the halt beside the status document; the status read itself bypasses the halt. */
export const STATUS_KEY: EsiStoreKey = { route: '/status/', holder: { kind: 'global' } };

/** The last two downtime failures (epoch ms) and, once two are far enough apart, when the halt ends. */
export interface DowntimeHalt {
  readonly failures: readonly number[];
  readonly haltUntil: number | null;
}

export const NO_HALT: DowntimeHalt = { failures: [], haltUntil: null };

/** What a status read came back with, as the halt counts it. */
export type StatusOutcome = 'answered' | 'down' | 'failed';

function minuteOfUtcDay(now: number): number {
  const at = new Date(now);
  return at.getUTCHours() * 60 + at.getUTCMinutes() + at.getUTCSeconds() / 60;
}

export function inDowntimeWindow(now: number): boolean {
  const minute = minuteOfUtcDay(now);
  return minute >= HALT_WINDOW_START_MINUTE && minute < HALT_WINDOW_END_MINUTE;
}

/** 11:30 UTC on the day of `now`. */
export function downtimeEndsAt(now: number): number {
  const at = new Date(now);
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), 11, 30);
}

function haltAfterFailure(failures: readonly number[], now: number): DowntimeHalt {
  const first = failures[0];
  if (first === undefined) return { failures: [now], haltUntil: null };
  const streak = [first, now];
  const haltUntil = now - first >= DOWNTIME_FAILURE_GAP_MS ? downtimeEndsAt(now) : null;
  return { failures: streak, haltUntil };
}

/**
 * The halt after one more status read. An answer, a failure of any other
 * kind, or a read outside the window clears the streak; a 503 or 504 inside
 * it extends the streak and, once the two are 25 s apart, halts until 11:30.
 * A halt already set stands until it runs out.
 */
export function noteStatusOutcome(halt: DowntimeHalt, outcome: StatusOutcome, now: number): DowntimeHalt {
  const haltUntil = halt.haltUntil !== null && halt.haltUntil > now ? halt.haltUntil : null;
  if (outcome !== 'down' || !inDowntimeWindow(now)) return { failures: [], haltUntil };
  if (haltUntil !== null) return { failures: halt.failures, haltUntil };
  return haltAfterFailure(halt.failures, now);
}

export function isHalted(halt: DowntimeHalt, now: number): boolean {
  return halt.haltUntil !== null && halt.haltUntil > now;
}

const isTimestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The halt kept in a status row body, or none when the body does not carry one. */
export function haltOf(body: unknown): DowntimeHalt {
  if (typeof body !== 'object' || body === null || !('halt' in body)) return NO_HALT;
  const halt = (body as { halt: unknown }).halt;
  if (typeof halt !== 'object' || halt === null) return NO_HALT;
  const { failures, haltUntil } = halt as { failures?: unknown; haltUntil?: unknown };
  return {
    failures: Array.isArray(failures) ? failures.filter(isTimestamp) : [],
    haltUntil: isTimestamp(haltUntil) ? haltUntil : null,
  };
}

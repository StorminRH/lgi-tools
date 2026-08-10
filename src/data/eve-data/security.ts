// System security classification (3.7.9) — the shared SDE-derived band a build
// location's industry rigs scale against, and the one-source-of-truth const both
// the structure-bonus math (industry-planner) and the owned-structures store read.
//
// PURE + dependency-free (no DB, no drizzle): the caller looks the system row up
// once and passes its `securityStatus` + `wormholeClassId` in. That keeps the band
// logic unit-testable in isolation and lets the type live in `src/data` so two
// features can consume it without a feature→feature import (the boundary rule).

/**
 * The four bands EVE industry rigs scale against. For the rig multiplier 'null' and
 * 'wormhole' are the SAME factor (CCP's 2357 covers both); the distinction is kept
 * for display, not for the math.
 */
export const SECURITY_CLASSES = ['high', 'low', 'null', 'wormhole'] as const;
/** Closed wormhole and known-space security classification derived from system security status. */
export type SecurityClass = (typeof SECURITY_CLASSES)[number];

/**
 * Derive a system's band from its SDE fields (eve_solar_systems):
 *   - wormholeClassId is CCP's first-party location class. J-space classes always
 *     carry one: 1–6 = C1–C6, 12 = Thera, 13 = shattered, 14–18 = Drifter — all
 *     'wormhole'. The K-space class ids (7/8/9 = hi/low/null) and Pochven (25) fall
 *     through to the security-status band below (and Pochven's negative sec lands on
 *     'null', which shares the wormhole rig multiplier anyway).
 *   - securityStatus is the raw −1.0..1.0 value. EVE's display rounds 0.45 up to 0.5,
 *     so ≥ 0.45 is hi-sec; any positive value below that is low-sec; ≤ 0.0 is null.
 *   - A null securityStatus (a handful of untagged hi-sec K-space rows in the SDE)
 *     defaults to 'high' — their band is hi-sec, just unlabelled.
 *
 * Sibling classifier: `wormhole-contract.ts` `isKnownSpaceSystemId` answers only
 * wormhole-vs-known-space from the bare system id, for callers with no SDE row
 * (Convex mutations). Prefer this row-based band when the fields are available.
 */
export function systemSecurityClass(
  securityStatus: number | null,
  wormholeClassId: number | null,
): SecurityClass {
  if (wormholeClassId !== null && (wormholeClassId <= 6 || (wormholeClassId >= 12 && wormholeClassId <= 18))) {
    return 'wormhole';
  }
  if (securityStatus === null) return 'high';
  if (securityStatus >= 0.45) return 'high';
  if (securityStatus > 0.0) return 'low';
  return 'null';
}

/**
 * Rounds raw SDE/ESI securityStatus to the one-decimal value shown in-game
 * (CCP System Security guide): normal half-up to 0.1, except any positive
 * value below 0.05 displays as 0.1 (never as 0.0).
 */
export function roundSecurityStatus(securityStatus: number): number {
  if (securityStatus === 0) return 0;
  if (securityStatus > 0 && securityStatus < 0.05) return 0.1;
  return Math.round(securityStatus * 10) / 10;
}

/**
 * Tailwind text class for the in-game security-status color band (CCP
 * Developer Docs “Security Status Colors”), keyed off the rounded display
 * value. Null status stays muted.
 */
export function securityStatusTextClass(
  securityStatus: number | null,
): string {
  if (securityStatus === null) return 'text-muted';
  const rounded = roundSecurityStatus(securityStatus);
  if (rounded >= 1.0) return 'text-sec-10';
  if (rounded >= 0.9) return 'text-sec-09';
  if (rounded >= 0.8) return 'text-sec-08';
  if (rounded >= 0.7) return 'text-sec-07';
  if (rounded >= 0.6) return 'text-sec-06';
  if (rounded >= 0.5) return 'text-sec-05';
  if (rounded >= 0.4) return 'text-sec-04';
  if (rounded >= 0.3) return 'text-sec-03';
  if (rounded >= 0.2) return 'text-sec-02';
  if (rounded >= 0.1) return 'text-sec-01';
  return 'text-sec-null';
}

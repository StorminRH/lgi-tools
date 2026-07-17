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

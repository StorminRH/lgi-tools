// The one system-identity readout rule (4.0.4.3.2 operator ruling D-E).
//
// Every surface that names a system — chain-canvas node headers, the
// current-system dock, and later the jump prompt — renders through
// `systemIdentityReadout`, so "what a system is called and what color that
// carries" has exactly one owner. K-space reads `<name> - <rounded security>`
// in the in-game security tone; J-space reads `<name> - C<class>` with the
// class colored on a light-green (C1) → deep-red (C6) ramp; C13 rides the
// dangerous end of that ramp; Thera, Pochven, and the Drifter complexes keep
// their own distinct tones.
//
// This module is also the sole home of the class-id → chip-text ladder that
// previously lived (deliberately duplicated) in `src/mapper/chain/labels.ts`;
// that file now consumes `systemClassText` from here.
import { roundSecurityStatus, securityStatusTextClass } from './security';

/**
 * The complete class-id → chip-text ladder, mirroring the authoritative
 * declaration on `eveSolarSystems.wormholeClassId` (`./schema.ts`).
 *
 * It must stay complete, not just plausible: the system directory passes every
 * SDE class id through unfiltered, so an id missing from here renders a
 * genuine wormhole system with no class text at all — the shattered and
 * Drifter systems a chain mapper exists to track.
 */
const CLASS_TEXT_BY_ID = new Map<number, string>([
  [1, 'C1'],
  [2, 'C2'],
  [3, 'C3'],
  [4, 'C4'],
  [5, 'C5'],
  [6, 'C6'],
  [7, 'HS'],
  [8, 'LS'],
  [9, 'NS'],
  [12, 'Thera'],
  [13, 'C13'],
  // 14–18 are the five Drifter complexes. The system's own name already
  // identifies which one, so the text carries the class rather than repeating it.
  [14, 'Drifter'],
  [15, 'Drifter'],
  [16, 'Drifter'],
  [17, 'Drifter'],
  [18, 'Drifter'],
  [25, 'Pochven'],
]);

/**
 * The class text for a location class id, or `null` for an unclassed system.
 *
 * `null` means "this system has no class to show", which is why the ladder
 * above must cover every id the SDE can produce — an unmapped id would be
 * indistinguishable from unclassed k-space.
 */
export function systemClassText(whClassId: number | null): string | null {
  if (whClassId === null) return null;
  return CLASS_TEXT_BY_ID.get(whClassId) ?? null;
}

/** The SDE facts one readout is derived from. */
export interface SystemIdentityFacts {
  readonly name: string;
  /** Raw SDE security status, or `null` when unknown/unresolved. */
  readonly security: number | null;
  /** Raw SDE wormhole class id, or `null` for plain k-space. */
  readonly whClassId: number | null;
}

/** One rendered identity: the readout text and the Tailwind text class carrying its tone. */
export interface SystemIdentityReadout {
  readonly label: string;
  readonly tone: string;
}

/**
 * The J-space class tone ramp (D-E): light-green (C1) → deep-red (C6). Tokens
 * live in the `@theme` block of `globals.css`; C13 deliberately shares C6's
 * dangerous-end tone, and the named specials keep their own distinct tones
 * from the existing shared palette.
 */
const CLASS_TONES_BY_ID = new Map<number, string>([
  [1, 'text-wh-c1'],
  [2, 'text-wh-c2'],
  [3, 'text-wh-c3'],
  [4, 'text-wh-c4'],
  [5, 'text-wh-c5'],
  [6, 'text-wh-c6'],
  [12, 'text-tone-teal'],
  [13, 'text-wh-c6'],
  [14, 'text-tone-purple'],
  [15, 'text-tone-purple'],
  [16, 'text-tone-purple'],
  [17, 'text-tone-purple'],
  [18, 'text-tone-purple'],
  [25, 'text-tone-red'],
]);

/**
 * The identity readout for one system (operator ruling D-E).
 *
 * K-space class ids (7/8/9) and unclassed systems render the security form;
 * every other known class id renders `<name> - <class text>` in that class's
 * tone. A system with neither a class nor a security value (an unresolved
 * directory entry showing its bare id) keeps its plain name in the neutral
 * name tone — a plainer label, not a loading state.
 */
export function systemIdentityReadout(
  facts: SystemIdentityFacts,
): SystemIdentityReadout {
  const { name, security, whClassId } = facts;
  const tone = whClassId === null ? undefined : CLASS_TONES_BY_ID.get(whClassId);
  if (tone !== undefined) {
    // Non-null tone implies the ladder covers the id; both maps share keys
    // except k-space 7/8/9, which fall through to the security form below.
    return { label: `${name} - ${systemClassText(whClassId)}`, tone };
  }
  if (security === null) return { label: name, tone: 'text-name' };
  return {
    label: `${name} - ${roundSecurityStatus(security).toFixed(1)}`,
    tone: securityStatusTextClass(security),
  };
}

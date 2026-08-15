// The one system-identity readout rule (4.0.4.3.2 operator ruling D-E).
//
// Every surface that names a system derives its class/security indicator from
// `systemClassificationReadout`, so "what classification is shown and what
// color it carries" has exactly one owner. Canvas nodes and the current-system
// dock render the plain system name separately from that colored indicator;
// sentence-like surfaces can keep consuming the composed
// `systemIdentityReadout` label.
//
// This module is also the sole home of the class-id → chip-text ladder that
// previously lived (deliberately duplicated) in `src/mapper/chain/labels.ts`;
// that file now consumes `systemClassText` from here.
import { roundSecurityStatus, securityStatusTextClass } from './security';
import {
  destinationHintSoleClassId,
  type WormholeDestinationHint,
} from './wormhole-contract';

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

/** The independently placeable class/security indicator beside a plain system name. */
export interface SystemClassificationReadout {
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
 * Broad known-space destination classes have no exact security value until a
 * destination system is known. These tones therefore represent the category,
 * not a fabricated numeric status: the boundary high-, low-, and null-sec
 * colors keep the same visual language as authored systems.
 */
const DESTINATION_CLASS_TONES_BY_ID = new Map<number, string>([
  [7, 'text-sec-05'],
  [8, 'text-sec-04'],
  [9, 'text-sec-null'],
]);

/** A codex destination class rendered without pretending its exact security is known. */
export function systemDestinationClassReadout(
  whClassId: number | null,
): SystemClassificationReadout | null {
  if (whClassId === null) return null;
  const label = systemClassText(whClassId);
  const tone = CLASS_TONES_BY_ID.get(whClassId)
    ?? DESTINATION_CLASS_TONES_BY_ID.get(whClassId);
  return label === null || tone === undefined ? null : { label, tone };
}

/**
 * Disc-short labels for Leads-to buckets that do not name one class.
 * Unique hints reuse `systemDestinationClassReadout` so HS/C6/Thera stay
 * identical to typed stubs. Bucket chips stay honest (`C1–C3`, not `C1`).
 */
const HINT_BUCKET_READOUT: Partial<
  Record<WormholeDestinationHint, SystemClassificationReadout>
> = {
  unknown: { label: 'C1–C3', tone: 'text-wh-c2' },
  dangerous: { label: 'C4–C5', tone: 'text-wh-c4' },
};

/** The class chip for a stored destination hint on an unresolved stub. */
export function systemDestinationHintReadout(
  hint: WormholeDestinationHint | null,
): SystemClassificationReadout | null {
  if (hint === null) return null;
  const soleClassId = destinationHintSoleClassId(hint);
  if (soleClassId !== null) return systemDestinationClassReadout(soleClassId);
  return HINT_BUCKET_READOUT[hint] ?? null;
}

/**
 * The colored portion of a system identity, without its plain system name.
 * Known J-space classes win over security; k-space renders rounded security;
 * an unresolved system has no indicator.
 */
export function systemClassificationReadout(
  facts: Pick<SystemIdentityFacts, 'security' | 'whClassId'>,
): SystemClassificationReadout | null {
  const { security, whClassId } = facts;
  if (whClassId !== null && CLASS_TONES_BY_ID.has(whClassId)) {
    return systemDestinationClassReadout(whClassId);
  }
  if (security === null) return null;
  return {
    label: roundSecurityStatus(security).toFixed(1),
    tone: securityStatusTextClass(security),
  };
}

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
  const classification = systemClassificationReadout(facts);
  if (classification === null) return { label: facts.name, tone: 'text-name' };
  return {
    label: `${facts.name} - ${classification.label}`,
    tone: classification.tone,
  };
}

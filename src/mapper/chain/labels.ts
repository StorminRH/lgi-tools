// Node labelling from the versioned client system directory (contract IS-3 / DC-3).
//
// Pure on purpose: the loader is async and session-memoized, so everything that decides what a node
// SAYS lives here and is tested without touching the network.
//
// The class-id vocabulary is duplicated from `src/scripts/check-universe-assets.ts` rather than
// imported or hoisted into `src/data/eve-data/`. Both alternatives were rejected: the mapper zone
// cannot import `src/scripts`, and contract §11 requires the directory loader to be CONSUMED, not
// extended, so the reference-data surfaces this session reads from must not grow. This is a display
// mapping owned by the surface that renders it; the directory keeps owning the raw ids.
import type { SystemDirectoryEntry } from '@/data/eve-data/universe-assets';

/** What a node displays for one system. */
export interface SystemLabel {
  readonly name: string;
  /** The class chip text, or `null` when the system has no class worth showing. */
  readonly className: string | null;
  /** Raw SDE security status for the shared dock/System Info readout. */
  readonly security?: number | null;
  /** Raw SDE wormhole class id, paired with security for display classification. */
  readonly whClassId?: number | null;
}

/**
 * The complete class-id ladder, mirroring the authoritative declaration on
 * `eveSolarSystems.wormholeClassId` (`src/data/eve-data/schema.ts`).
 *
 * It must stay complete, not just plausible: the directory passes every SDE class id through
 * unfiltered, so an id missing from here renders a genuine wormhole system with no chip at all — the
 * shattered and Drifter systems a chain mapper exists to track.
 */
const CLASS_LABELS_BY_ID = new Map<number, string>([
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
  // 14–18 are the five Drifter complexes. The system's own name already identifies which one, so the
  // chip carries the class rather than repeating it.
  [14, 'Drifter'],
  [15, 'Drifter'],
  [16, 'Drifter'],
  [17, 'Drifter'],
  [18, 'Drifter'],
  [25, 'Pochven'],
]);

/**
 * The chip text for a location class id, or `null` for an unclassed system.
 *
 * `null` means "this system has no class to show", which is why the ladder above must cover every id
 * the directory can produce — an unmapped id would be indistinguishable from unclassed k-space.
 */
export function systemClassLabel(whClassId: number | null): string | null {
  if (whClassId === null) return null;
  return CLASS_LABELS_BY_ID.get(whClassId) ?? null;
}

/**
 * Resolves one node's display label, falling back silently to the bare system id.
 *
 * The fallback is deliberate and load-bearing for HC-5: a node whose directory entry has not arrived
 * yet is not a loading state, it is a node with a plainer label that fills in later without any
 * intent and without touching its position. Pass `null` for `systemInfo` before the directory loads
 * or after a load failure.
 */
export function resolveSystemLabel(
  systemId: number,
  systemInfo: ((id: number) => SystemDirectoryEntry | null) | null,
): SystemLabel {
  const entry = systemInfo === null ? null : systemInfo(systemId);
  if (entry === null) {
    return {
      name: String(systemId),
      className: null,
      security: null,
      whClassId: null,
    };
  }
  return {
    name: entry.name,
    className: systemClassLabel(entry.whClassId),
    security: entry.security,
    whClassId: entry.whClassId,
  };
}

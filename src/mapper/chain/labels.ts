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
}

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
]);

/** The chip text for a wormhole class id, or `null` for k-space and unmapped ids. */
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
  if (entry === null) return { name: String(systemId), className: null };
  return { name: entry.name, className: systemClassLabel(entry.whClassId) };
}

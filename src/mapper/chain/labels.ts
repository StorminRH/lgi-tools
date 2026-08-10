// Node labelling from the versioned client system directory (contract IS-3 / DC-3).
//
// Pure on purpose: the loader is async and session-memoized, so everything that decides what a node
// SAYS lives here and is tested without touching the network.
//
// The class-id → text ladder itself lives in `src/data/eve-data/system-identity.ts` (the one
// identity-readout rule, 4.0.4.3.2 D-E); this file only resolves directory entries into the
// node-data shape and consumes that shared rule.
import { systemClassText } from '@/data/eve-data/system-identity';
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
    className: systemClassText(entry.whClassId),
    security: entry.security,
    whClassId: entry.whClassId,
  };
}

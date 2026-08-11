import {
  FAR_SIDE_WORMHOLE_CODE,
  type ConnectionProvenance,
} from '@/data/eve-data/wormhole-contract';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import type { WhObservationInput } from './queries';

/** Endpoint-local identity facts one D16 observation may be derived from. */
export interface ObservationFacts {
  /** The system whose side carries the attributable typed code. */
  readonly typedSystemId: number;
  readonly whTypeCode: string | null;
  readonly provenance: ConnectionProvenance | null;
  readonly dedupeKey: string | null;
  /**
   * Effective wormhole class behind the hole, or null while the far side is
   * unknown — an unresolved scanned row has nothing to contradict.
   */
  readonly destinationClassId: number | null;
}

/**
 * Decides the one observation an identified hole justifies, or null when the
 * facts are unattributable: untyped, far-side K162, outside the codex, or
 * class-contradicted by a known destination. Sole owner of the emission guard
 * for every channel, so a null answer is equally the signal to repair a row a
 * correction has vacated.
 */
export function observationFor(
  facts: ObservationFacts,
  codex: readonly WormholeCodexEntry[],
): Omit<WhObservationInput, 'observedAt'> | null {
  if (
    facts.whTypeCode === null
    || facts.whTypeCode === FAR_SIDE_WORMHOLE_CODE
    || facts.provenance === null
    || facts.dedupeKey === null
  ) {
    return null;
  }
  const entry = codex.find((candidate) => candidate.code === facts.whTypeCode);
  if (entry === undefined || entry.farSide) return null;
  if (
    facts.destinationClassId !== null
    && entry.targetClass !== facts.destinationClassId
  ) {
    return null;
  }
  return {
    solarSystemId: facts.typedSystemId,
    whTypeCode: entry.code,
    provenance: facts.provenance,
    dedupeKey: facts.dedupeKey,
  };
}

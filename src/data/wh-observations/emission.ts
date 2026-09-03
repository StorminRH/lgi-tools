import {
  FAR_SIDE_WORMHOLE_CODE,
  type ConnectionProvenance,
} from '@/data/eve-data/wormhole-contract';
import type { WormholeCodexEntry } from '@/data/eve-data/universe-assets';
import type { WhObservationInput } from './queries';

export interface ObservationFacts {
  readonly typedSystemId: number;
  readonly whTypeCode: string | null;
  readonly provenance: ConnectionProvenance | null;
  readonly dedupeKey: string | null;
  readonly destinationClassId: number | null;
}

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

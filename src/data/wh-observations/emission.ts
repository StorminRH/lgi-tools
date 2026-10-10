import type { ConnectionProvenance } from '@/data/eve-data/wormhole-contract';
import type { WormholeCodexIndex } from '@/data/eve-data/wormhole-codex-index';
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
  codex: Pick<WormholeCodexIndex, 'byCode'>,
): Omit<WhObservationInput, 'observedAt'> | null {
  if (
    facts.whTypeCode === null
    || facts.provenance === null
    || facts.dedupeKey === null
  ) {
    return null;
  }
  const entry = codex.byCode(facts.whTypeCode);
  if (entry === null || entry.farSide) return null;
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

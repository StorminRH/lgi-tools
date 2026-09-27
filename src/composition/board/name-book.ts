import {
  getImplantDogma,
  getNpcStationFacts,
  getSkillCatalog,
  getSystemFacts,
} from '@/data/eve-data/character-facts';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import { getTypeNames } from '@/data/eve-data/queries';
import type { NameBook, NameIdRequest, PlaceFacts, TypeFacts } from './board-assemble';
import { resolveValuationBook } from './price-book';

export interface ResolvedNameBook extends NameBook {
  /** Marketable owned types that still lack a price row; seeded after the write-behind. */
  unseededTypeIds: number[];
}

export async function resolveNameBook(request: NameIdRequest): Promise<ResolvedNameBook> {
  const stations = await getNpcStationFacts(request.stationIds);
  const namelessStations = [...stations].filter(([, facts]) => facts.name === null).map(([id]) => id);
  const systemIds = [...new Set([...request.systemIds, ...[...stations.values()].map((facts) => facts.systemId)])];

  const [typeNames, dogma, systems, entities, skillCatalog, valuation] = await Promise.all([
    getTypeNames(request.typeIds),
    getImplantDogma(request.typeIds),
    getSystemFacts(systemIds),
    resolveEntityNames([...request.entityIds, ...namelessStations]),
    getSkillCatalog(),
    resolveValuationBook(request.valuationTypeIds),
  ]);

  const types = new Map<number, TypeFacts>();
  for (const [typeId, name] of typeNames) {
    const implant = dogma.get(typeId);
    types.set(typeId, { name, implantSlot: implant?.slot ?? null, attributeBonus: implant?.bonus ?? {} });
  }

  const npcStations = new Map<number, PlaceFacts>();
  for (const [stationId, facts] of stations) {
    const name = facts.name ?? entities[String(stationId)];
    if (name !== undefined) npcStations.set(stationId, { name, systemId: facts.systemId });
  }

  return {
    types,
    systems,
    npcStations,
    entities,
    skillCatalog,
    prices: valuation.prices,
    typeCategories: valuation.categories,
    unseededTypeIds: valuation.unseeded,
  };
}

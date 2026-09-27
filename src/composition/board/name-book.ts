import {
  getImplantDogma,
  getNpcStationFacts,
  getSkillCatalog,
  getSystemFacts,
} from '@/data/eve-data/character-facts';
import { resolveEntityNames } from '@/data/eve-data/entity-names';
import { getTypeNames } from '@/data/eve-data/queries';
import type { NameBook, NameIdRequest, PlaceFacts, TypeFacts } from './board-assemble';

/**
 * One pass for the whole roster: SDE for types, systems, stations and the skill
 * catalog; the ESI names resolver for corporations, alliances and any NPC station
 * the SDE backfill has not named yet.
 */
export async function resolveNameBook(request: NameIdRequest): Promise<NameBook> {
  const stations = await getNpcStationFacts(request.stationIds);
  const namelessStations = [...stations].filter(([, facts]) => facts.name === null).map(([id]) => id);
  const systemIds = [...new Set([...request.systemIds, ...[...stations.values()].map((facts) => facts.systemId)])];

  const [typeNames, dogma, systems, entities, skillCatalog] = await Promise.all([
    getTypeNames(request.typeIds),
    getImplantDogma(request.typeIds),
    getSystemFacts(systemIds),
    resolveEntityNames([...request.entityIds, ...namelessStations]),
    getSkillCatalog(),
  ]);

  const types = new Map<number, TypeFacts>();
  for (const [typeId, name] of typeNames) {
    const implant = dogma.get(typeId);
    types.set(typeId, { name, implantSlot: implant?.slot ?? null, attributeBonus: implant?.bonus ?? {} });
  }

  const places = new Map<number, PlaceFacts>();
  for (const [stationId, facts] of stations) {
    const name = facts.name ?? entities[String(stationId)];
    if (name !== undefined) places.set(stationId, { name, systemId: facts.systemId });
  }

  return { types, systems, places, entities, skillCatalog };
}

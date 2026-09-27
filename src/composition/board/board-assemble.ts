import { ATTRIBUTE_KEYS, type AttributeKey } from '@/data/eve-data/character-attributes';
import type { SystemFacts } from '@/data/eve-data/character-facts';
import { systemSecurityClass } from '@/data/eve-data/security';
import { LOCATION_SYNC_SCOPES } from '@/data/location-tracking/sync-eligibility';
import { journalRefLabel } from '@/features/character-sheet/ref-types';
import { canSyncSection, SHEET_SECTION_SCOPES } from '@/features/character-sheet/sync-eligibility';
import type {
  AttributesPart,
  ClonesPart,
  JournalDigest,
  SectionEnvelope,
  SheetSectionData,
  SheetSectionKey,
  SheetSections,
} from '@/features/character-sheet/types';
import { deriveJobStatus } from '@/features/industry-jobs/job-state';
import { jobOccupiesSlot, slotCapacity } from '@/features/industry-jobs/slots';
import { canSyncIndustryJobs, INDUSTRY_JOBS_SYNC_SCOPES } from '@/features/industry-jobs/sync-eligibility';
import type { CharacterJobsData } from '@/features/industry-jobs/types';
import { canSyncSkillQueue, SKILL_SYNC_SCOPES } from '@/features/skill-queue/sync-eligibility';
import type { CharacterSkillData } from '@/features/skill-queue/types';
import {
  BOARD_GAPS,
  type BoardCharacter,
  type BoardGap,
  type BoardIndustryData,
  type BoardResponse,
  type BoardSection,
  type BoardSkillsData,
  type PlaceRef,
  type SkillCatalogGroup,
  type SystemRef,
} from './api-contract';

export interface BoardIdentity {
  characterId: number;
  name: string;
  portraitUrl: string;
  corporationId: number | null;
  allianceId: number | null;
}

export interface BoardHealth {
  hasRefreshToken: boolean;
  missingScopes: string[];
}

export interface BoardRaw {
  identity: BoardIdentity;
  health: BoardHealth;
  sheet: SheetSections | null;
  skills: { data: CharacterSkillData | null; levels: Record<string, number> | null; refreshedAt: number | null };
  jobs: { data: CharacterJobsData | null; refreshedAt: number | null };
}

export interface TypeFacts {
  name: string;
  implantSlot: number | null;
  attributeBonus: Partial<Record<AttributeKey, number>>;
}

export interface PlaceFacts {
  name: string;
  systemId: number | null;
}

export interface NameBook {
  types: Map<number, TypeFacts>;
  systems: Map<number, SystemFacts>;
  npcStations: Map<number, PlaceFacts>;
  entities: Record<string, string>;
  skillCatalog: SkillCatalogGroup[];
}

export interface NameIdRequest {
  typeIds: number[];
  systemIds: number[];
  stationIds: number[];
  entityIds: number[];
}

const GAP_SCOPES: Record<BoardGap, readonly string[]> = {
  skills: SKILL_SYNC_SCOPES,
  location: LOCATION_SYNC_SCOPES,
  wallet: SHEET_SECTION_SCOPES.wallet,
  clones: SHEET_SECTION_SCOPES.clones,
  implants: SHEET_SECTION_SCOPES.implants,
  structures: SHEET_SECTION_SCOPES.structures,
  industry: INDUSTRY_JOBS_SYNC_SCOPES,
  orders: SHEET_SECTION_SCOPES.orders,
};

const SECTION_GAP: Record<SheetSectionKey, BoardGap | null> = {
  profile: null,
  status: 'location',
  attributes: 'skills',
  implants: 'implants',
  clones: 'clones',
  wallet: 'wallet',
  journal: 'wallet',
  orders: 'orders',
  structures: 'structures',
};

function sorted(ids: Iterable<number>): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

function cloneStationIds(clones: ClonesPart | undefined): number[] {
  const locations = [clones?.home ?? null, ...(clones?.jumpClones.map((clone) => clone.location) ?? [])];
  return locations.flatMap((location) =>
    location !== null && location.locationType === 'station' ? [location.locationId] : [],
  );
}

export function collectNameIds(raws: BoardRaw[]): NameIdRequest {
  const typeIds: number[] = [];
  const systemIds: number[] = [];
  const stationIds: number[] = [];
  const entityIds: number[] = [];
  for (const raw of raws) {
    if (raw.identity.corporationId !== null) entityIds.push(raw.identity.corporationId);
    if (raw.identity.allianceId !== null) entityIds.push(raw.identity.allianceId);
    const status = raw.sheet?.status?.data;
    if (status != null) {
      typeIds.push(status.ship.shipTypeId);
      systemIds.push(status.location.solarSystemId);
      if (status.location.stationId !== null) stationIds.push(status.location.stationId);
    }
    typeIds.push(...(raw.sheet?.implants?.data?.implants ?? []));
    const clones = raw.sheet?.clones?.data?.clones;
    stationIds.push(...cloneStationIds(clones));
    for (const clone of clones?.jumpClones ?? []) typeIds.push(...clone.implantTypeIds);
  }
  return {
    typeIds: sorted(typeIds),
    systemIds: sorted(systemIds),
    stationIds: sorted(stationIds),
    entityIds: sorted(entityIds),
  };
}

function sectionOf<K extends SheetSectionKey, T>(
  eligible: boolean,
  envelope: SectionEnvelope<K> | undefined,
  map: (data: SheetSectionData[K]) => T,
): BoardSection<T> {
  if (!eligible || envelope?.denied === true) return { state: 'reconnect' };
  if (envelope === undefined) return { state: 'pending' };
  return { state: 'ready', refreshedAt: Date.parse(envelope.refreshedAt), data: map(envelope.data) };
}

function datasetOf<T, U>(
  eligible: boolean,
  data: T | null,
  refreshedAt: number | null,
  map: (data: T) => U,
): BoardSection<U> {
  if (!eligible) return { state: 'reconnect' };
  if (data === null) return { state: 'pending' };
  return { state: 'ready', refreshedAt: refreshedAt ?? 0, data: map(data) };
}

function systemRef(names: NameBook, id: number): SystemRef {
  const facts = names.systems.get(id);
  return {
    id,
    name: facts?.name ?? 'Unknown system',
    security: facts?.security ?? null,
    secClass: facts?.secClass ?? systemSecurityClass(null, null),
  };
}

function placeRef(
  names: NameBook,
  structures: SheetSectionData['structures'] | null,
  kind: 'station' | 'structure',
  id: number,
): PlaceRef {
  if (kind === 'structure') {
    const structure = structures?.names[String(id)];
    return { kind, id, name: structure?.kind === 'named' ? structure.name : null, system: null };
  }
  const facts = names.npcStations.get(id);
  return {
    kind,
    id,
    name: facts?.name ?? null,
    system: facts?.systemId == null ? null : systemRef(names, facts.systemId),
  };
}

function entityRef(names: NameBook, id: number | null): { id: number; name: string | null } | null {
  return id === null ? null : { id, name: names.entities[String(id)] ?? null };
}

function mapStatus(
  data: SheetSectionData['status'],
  structures: SheetSectionData['structures'] | null,
  names: NameBook,
) {
  const { location, ship, online } = data;
  const system = systemRef(names, location.solarSystemId);
  const dockId = location.stationId ?? location.structureId;
  const dockKind = location.stationId !== null ? 'station' : 'structure';
  const dock = dockId === null ? null : { ...placeRef(names, structures, dockKind, dockId), system };
  return {
    online: online.online,
    lastLogin: online.lastLogin,
    system,
    dock,
    ship: {
      typeId: ship.shipTypeId,
      typeName: names.types.get(ship.shipTypeId)?.name ?? 'Unknown ship',
      name: ship.shipName,
    },
  };
}

function implantBonus(names: NameBook, implantIds: number[], key: AttributeKey): number {
  return implantIds.reduce((sum, id) => sum + (names.types.get(id)?.attributeBonus[key] ?? 0), 0);
}

function mapAttributes(attributes: AttributesPart, implantIds: number[], names: NameBook) {
  return {
    values: ATTRIBUTE_KEYS.map((key) => ({
      key,
      base: attributes[key],
      implant: implantBonus(names, implantIds, key),
    })),
    bonusRemaps: attributes.bonusRemaps,
    lastRemapDate: attributes.lastRemapDate,
    nextRemapDate: attributes.accruedRemapCooldownDate,
  };
}

function mapImplants(implantIds: number[], names: NameBook) {
  const implants = implantIds.map((typeId) => {
    const facts = names.types.get(typeId);
    return { typeId, name: facts?.name ?? 'Unknown implant', slot: facts?.implantSlot ?? null };
  });
  const slotOrder = (slot: number | null) => slot ?? Number.MAX_SAFE_INTEGER;
  implants.sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot) || a.typeId - b.typeId);
  return { implants };
}

function mapClones(
  clones: ClonesPart,
  structures: SheetSectionData['structures'] | null,
  names: NameBook,
) {
  const { home } = clones;
  return {
    home: home === null ? null : placeRef(names, structures, home.locationType, home.locationId),
    lastJumpDate: clones.lastCloneJumpDate,
    jumpClones: clones.jumpClones.map((clone) => ({
      id: clone.jumpCloneId,
      name: clone.name,
      location: placeRef(names, structures, clone.location.locationType, clone.location.locationId),
      implantCount: clone.implantTypeIds.length,
    })),
  };
}

function mapJournal(journal: JournalDigest) {
  return {
    windowStart: journal.windowStart,
    inflow: journal.inflow,
    outflow: journal.outflow,
    series: journal.series,
    recent: journal.recent.map((entry) => ({
      id: entry.id,
      date: entry.date,
      refLabel: journalRefLabel(entry.refType),
      amount: entry.amount,
      description: entry.description,
    })),
  };
}

function mapSkills(data: CharacterSkillData, levels: Record<string, number> | null): BoardSkillsData {
  const known = levels ?? {};
  const trained = Object.values(known);
  return {
    totalSp: data.totalSp,
    unallocatedSp: data.unallocatedSp ?? null,
    queue: data.entries,
    levels: known,
    known: trained.length,
    atV: trained.filter((level) => level === 5).length,
  };
}

function mapIndustry(
  data: CharacterJobsData,
  levels: Record<string, number> | null,
  now: number,
): BoardIndustryData {
  const statuses = data.jobs.map((job) => deriveJobStatus(job.status, job.end_date, now));
  const capacity = slotCapacity(levels);
  return {
    active: statuses.filter((status) => status === 'active').length,
    ready: statuses.filter((status) => status === 'ready').length,
    slots: {
      used: statuses.filter(jobOccupiesSlot).length,
      max: capacity.manufacturing + capacity.science + capacity.reactions,
    },
  };
}

function deniedGaps(sheet: SheetSections | null): Set<BoardGap> {
  const gaps = new Set<BoardGap>();
  for (const [key, gap] of Object.entries(SECTION_GAP) as [SheetSectionKey, BoardGap | null][]) {
    if (gap !== null && sheet?.[key]?.denied === true) gaps.add(gap);
  }
  return gaps;
}

function boardGaps(raw: BoardRaw): BoardGap[] {
  if (!raw.health.hasRefreshToken) return [...BOARD_GAPS];
  const denied = deniedGaps(raw.sheet);
  return BOARD_GAPS.filter(
    (gap) =>
      denied.has(gap) || GAP_SCOPES[gap].some((scope) => raw.health.missingScopes.includes(scope)),
  );
}

export function assembleBoardCharacter(raw: BoardRaw, names: NameBook, now: number): BoardCharacter {
  const { identity, health, sheet } = raw;
  const eligible = (key: SheetSectionKey) => canSyncSection(key, health);
  const structures = sheet?.structures?.data ?? null;
  const implantIds = sheet?.implants?.denied === true ? [] : (sheet?.implants?.data?.implants ?? []);
  return {
    characterId: identity.characterId,
    name: identity.name,
    portraitUrl: identity.portraitUrl,
    corporation: entityRef(names, identity.corporationId),
    alliance: entityRef(names, identity.allianceId),
    gaps: boardGaps(raw),
    skills: datasetOf(canSyncSkillQueue(health), raw.skills.data, raw.skills.refreshedAt, (data) =>
      mapSkills(data, raw.skills.levels),
    ),
    profile: sectionOf(eligible('profile'), sheet?.profile, (data) => data.character),
    status: sectionOf(eligible('status'), sheet?.status, (data) => mapStatus(data, structures, names)),
    attributes: sectionOf(eligible('attributes'), sheet?.attributes, (data) =>
      mapAttributes(data.attributes, implantIds, names),
    ),
    implants: sectionOf(eligible('implants'), sheet?.implants, (data) =>
      mapImplants(data.implants, names),
    ),
    clones: sectionOf(eligible('clones'), sheet?.clones, (data) =>
      mapClones(data.clones, structures, names),
    ),
    wallet: sectionOf(eligible('wallet'), sheet?.wallet, (data) => ({ balance: data.balance })),
    journal: sectionOf(eligible('journal'), sheet?.journal, (data) => mapJournal(data.journal)),
    industry: datasetOf(canSyncIndustryJobs(health), raw.jobs.data, raw.jobs.refreshedAt, (data) =>
      mapIndustry(data, raw.skills.levels, now),
    ),
  };
}

export function assembleBoard(raws: BoardRaw[], names: NameBook, now: number): BoardResponse {
  return {
    characters: raws.map((raw) => assembleBoardCharacter(raw, names, now)),
    skillCatalog: names.skillCatalog,
  };
}

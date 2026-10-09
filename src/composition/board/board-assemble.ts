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
import type { JobCategory } from '@/features/industry-jobs/industry-jobs-styles';
import { deriveJobStatus } from '@/features/industry-jobs/job-state';
import { countUsedSlots, slotCapacity } from '@/features/industry-jobs/slots';
import { canSyncIndustryJobs, INDUSTRY_JOBS_SYNC_SCOPES } from '@/features/industry-jobs/sync-eligibility';
import type { CharacterJobsData } from '@/features/industry-jobs/types';
import { canSyncSkillQueue, SKILL_SYNC_SCOPES } from '@/features/skill-queue/sync-eligibility';
import { canSyncAssets, ASSETS_SYNC_SCOPES } from '@/features/owned-assets/sync-eligibility';
import type { NetWorthDay, PilotWorth } from '@/features/net-worth/types';
import {
  type AssetLine,
  type PriceBook,
  type TypeCategories,
  valueCharacter,
} from '@/features/net-worth/valuation';
import type { CharacterSkillData } from '@/features/skill-queue/types';
import {
  BOARD_GAPS,
  type BoardCharacter,
  type BoardGap,
  type BoardHistoryDay,
  type BoardIndustryData,
  type BoardNetWorthData,
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
  /** rows is null until the first assets sync has landed; an empty list is a synced, empty hangar. */
  assets: { rows: AssetLine[] | null; refreshedAt: number | null };
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
  prices: PriceBook;
  typeCategories: TypeCategories;
}

export interface NameIdRequest {
  typeIds: number[];
  systemIds: number[];
  stationIds: number[];
  entityIds: number[];
  /** Every type the valuation prices: asset rows, implants and open orders. */
  valuationTypeIds: number[];
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
  assets: ASSETS_SYNC_SCOPES,
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

function implantIdsOf(raw: BoardRaw): { active: number[]; jumpClones: number[][] } {
  const sheet = raw.sheet;
  return {
    active: sheet?.implants?.denied === true ? [] : (sheet?.implants?.data?.implants ?? []),
    jumpClones: (sheet?.clones?.data?.clones.jumpClones ?? []).map((clone) => clone.implantTypeIds),
  };
}

function openOrdersOf(raw: BoardRaw) {
  const orders = raw.sheet?.orders;
  return orders?.denied === true ? [] : (orders?.data?.orders.open ?? []);
}

function valuationTypeIdsOf(raw: BoardRaw): number[] {
  const implants = implantIdsOf(raw);
  return [
    ...(raw.assets.rows ?? []).map((line) => line.typeId),
    ...implants.active,
    ...implants.jumpClones.flat(),
    ...openOrdersOf(raw).map((order) => order.typeId),
  ];
}

export function collectNameIds(raws: BoardRaw[]): NameIdRequest {
  const typeIds: number[] = [];
  const systemIds: number[] = [];
  const stationIds: number[] = [];
  const entityIds: number[] = [];
  const valuationTypeIds: number[] = [];
  for (const raw of raws) {
    valuationTypeIds.push(...valuationTypeIdsOf(raw));
    if (raw.identity.corporationId !== null) entityIds.push(raw.identity.corporationId);
    if (raw.identity.allianceId !== null) entityIds.push(raw.identity.allianceId);
    const status = raw.sheet?.status?.data;
    if (status != null) {
      typeIds.push(status.ship.shipTypeId);
      systemIds.push(status.location.solarSystemId);
      if (status.location.stationId !== null) stationIds.push(status.location.stationId);
    }
    const implants = implantIdsOf(raw);
    typeIds.push(...implants.active, ...implants.jumpClones.flat());
    const clones = raw.sheet?.clones?.data?.clones;
    stationIds.push(...cloneStationIds(clones));
  }
  return {
    typeIds: sorted(typeIds),
    systemIds: sorted(systemIds),
    stationIds: sorted(stationIds),
    entityIds: sorted(entityIds),
    valuationTypeIds: sorted(valuationTypeIds),
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
    values: ATTRIBUTE_KEYS.map((key) => {
      const implant = implantBonus(names, implantIds, key);
      return { key, base: attributes[key] - implant, implant };
    }),
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

const slotTotal = (perCategory: Readonly<Record<JobCategory, number>>): number =>
  perCategory.manufacturing + perCategory.science + perCategory.reactions;

function mapIndustry(
  data: CharacterJobsData,
  levels: Record<string, number> | null,
  now: number,
  characterId: number,
): BoardIndustryData {
  const statuses = data.jobs.map((job) => deriveJobStatus(job.status, job.end_date, now));
  return {
    active: statuses.filter((status) => status === 'active').length,
    ready: statuses.filter((status) => status === 'ready').length,
    slots: {
      // The board has no corp-job feed yet; pass the pilot's corp jobs here once it reads them.
      used: slotTotal(countUsedSlots(characterId, data.jobs, [])),
      max: slotTotal(slotCapacity(levels)),
    },
  };
}

/** A pilot's worth needs both a wallet and assets it may sync; without them it asks for a reconnect. */
function worthEligible(raw: BoardRaw): boolean {
  return canSyncSection('wallet', raw.health) && canSyncAssets(raw.health) && raw.sheet?.wallet?.denied !== true;
}

/** Values the stored holdings at stored prices; null until the wallet and the assets have both synced. */
function pilotWorthOf(raw: BoardRaw, names: Pick<NameBook, 'prices' | 'typeCategories'>): PilotWorth | null {
  const wallet = raw.sheet?.wallet;
  if (!worthEligible(raw) || wallet === undefined || wallet.denied === true || raw.assets.rows === null) return null;
  const implants = implantIdsOf(raw);
  const { total, liquid } = valueCharacter(
    {
      wallet: wallet.data.balance,
      assets: raw.assets.rows,
      activeImplants: implants.active,
      jumpCloneImplants: implants.jumpClones,
      orders: openOrdersOf(raw),
    },
    names.prices,
    names.typeCategories,
  );
  return { netWorth: total, liquidIsk: liquid };
}

export interface StoredWorth {
  worth: PilotWorth;
  at: number;
}

/** Each pilot's latest recorded worth: a pilot missing from a later day keeps its last value. */
function latestStoredWorth(history: readonly BoardHistoryDay[]): Map<string, StoredWorth> {
  const latest = new Map<string, StoredWorth>();
  for (const day of history) {
    const at = Date.parse(`${day.day}T00:00:00Z`);
    for (const [id, worth] of Object.entries(day.pilots)) latest.set(id, { worth, at });
  }
  return latest;
}

/** The recorded worth, never a live valuation: the nightly revalue and a character link write it. */
function storedWorthOf(raw: BoardRaw, stored: StoredWorth | undefined): BoardSection<BoardNetWorthData> {
  if (!worthEligible(raw)) return { state: 'reconnect' };
  if (stored === undefined) return { state: 'pending' };
  return {
    state: 'ready',
    refreshedAt: stored.at,
    data: { total: stored.worth.netWorth, liquid: stored.worth.liquidIsk },
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

export function assembleBoardCharacter(
  raw: BoardRaw,
  names: NameBook,
  now: number,
  stored?: StoredWorth,
): BoardCharacter {
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
      mapIndustry(data, raw.skills.levels, now, identity.characterId),
    ),
    netWorth: storedWorthOf(raw, stored),
  };
}

export function toHistoryDay(day: NetWorthDay): BoardHistoryDay {
  return {
    day: day.day,
    netWorth: day.netWorth,
    liquidIsk: day.liquidIsk,
    included: day.pilotsIncluded,
    total: day.pilotsTotal,
    pilots: day.pilots,
  };
}

/** The account's day valued from stored holdings and prices: only pilots with a computable worth count. */
export function netWorthSnapshot(raws: readonly BoardRaw[], names: Pick<NameBook, 'prices' | 'typeCategories'>, day: string): NetWorthDay {
  const pilots: NetWorthDay['pilots'] = {};
  let netWorth = 0;
  let liquidIsk = 0;
  for (const raw of raws) {
    const worth = pilotWorthOf(raw, names);
    if (worth === null) continue;
    pilots[String(raw.identity.characterId)] = worth;
    netWorth += worth.netWorth;
    liquidIsk += worth.liquidIsk;
  }
  return {
    day,
    netWorth: Math.round(netWorth * 100) / 100,
    liquidIsk: Math.round(liquidIsk * 100) / 100,
    pilotsIncluded: Object.keys(pilots).length,
    pilotsTotal: raws.length,
    pilots,
  };
}

export function assembleBoard(
  raws: BoardRaw[],
  names: NameBook,
  now: number,
  history: BoardHistoryDay[],
): BoardResponse {
  const stored = latestStoredWorth(history);
  return {
    characters: raws.map((raw) =>
      assembleBoardCharacter(raw, names, now, stored.get(String(raw.identity.characterId))),
    ),
    skillCatalog: names.skillCatalog,
    history,
  };
}

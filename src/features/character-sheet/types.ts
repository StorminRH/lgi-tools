import type { CharacterOwner } from '@/platform/owner-sync';
import type { AttributeKey } from '@/data/eve-data/character-attributes';
import type { LocationBody } from '@/data/location-tracking/esi-projection';

export type SheetSectionKey =
  | 'profile'
  | 'status'
  | 'attributes'
  | 'implants'
  | 'clones'
  | 'wallet'
  | 'journal'
  | 'structures';

export type DirectSectionKey = Exclude<SheetSectionKey, 'structures'>;

export type SheetTier = 'live' | 'hourly' | 'daily';

export interface CharacterPart {
  birthday: string;
  securityStatus: number | null;
}

export type LocationPart = LocationBody;

export interface ShipPart {
  shipTypeId: number;
  shipItemId: number;
  shipName: string;
}

export interface OnlinePart {
  online: boolean;
  lastLogin: string | null;
  lastLogout: string | null;
}

export interface AttributesPart extends Record<AttributeKey, number> {
  bonusRemaps: number;
  lastRemapDate: string | null;
  accruedRemapCooldownDate: string | null;
}

export interface CloneLocation {
  locationId: number;
  locationType: 'station' | 'structure';
}

export interface JumpClone {
  jumpCloneId: number;
  location: CloneLocation;
  implantTypeIds: number[];
  name: string | null;
}

export interface ClonesPart {
  home: CloneLocation | null;
  jumpClones: JumpClone[];
  lastCloneJumpDate: string | null;
}

export interface JournalEntry {
  id: number;
  date: string;
  refType: string;
  amount: number;
  balance: number | null;
  description: string;
}

export interface JournalSeriesPoint {
  t: number;
  balance: number;
}

export interface JournalDigest {
  windowStart: string;
  inflow: number;
  outflow: number;
  series: JournalSeriesPoint[];
  recent: JournalEntry[];
}

export type StructureName = { kind: 'named'; name: string } | { kind: 'hidden' };

export interface SheetSectionData {
  profile: { character: CharacterPart };
  status: { location: LocationPart; ship: ShipPart; online: OnlinePart };
  attributes: { attributes: AttributesPart };
  implants: { implants: number[] };
  clones: { clones: ClonesPart };
  wallet: { balance: number };
  journal: { journal: JournalDigest };
  structures: { names: Record<string, StructureName> };
}

export type SheetPart<K extends SheetSectionKey> = keyof SheetSectionData[K] & string;

export type PartEtags<K extends SheetSectionKey> = Partial<Record<SheetPart<K>, string | null>>;

export interface EnvelopeStamp<K extends SheetSectionKey> {
  refreshedAt: string;
  etags: PartEtags<K>;
}

export interface DataEnvelope<K extends SheetSectionKey> extends EnvelopeStamp<K> {
  data: SheetSectionData[K];
  denied?: never;
}

export interface DeniedEnvelope<K extends SheetSectionKey> extends EnvelopeStamp<K> {
  data: SheetSectionData[K] | null;
  denied: true;
}

export type SectionEnvelope<K extends SheetSectionKey> = DataEnvelope<K> | DeniedEnvelope<K>;

export type SheetSections = { [K in SheetSectionKey]?: SectionEnvelope<K> };

export interface SectionSyncState<K extends SheetSectionKey> {
  lastRefreshedAt: Date | null;
  previous: SectionEnvelope<K> | null;
  heldEtags: PartEtags<K>;
}

export type SheetEndpoint =
  | 'character'
  | 'location'
  | 'ship'
  | 'online'
  | 'attributes'
  | 'implants'
  | 'clones'
  | 'wallet'
  | 'journal';

export interface PartSpec<K extends DirectSectionKey, P extends SheetPart<K>> {
  endpoint: SheetEndpoint;
  parse(body: unknown, now: Date): SheetSectionData[K][P] | null;
}

export interface DirectSectionSpec<K extends DirectSectionKey> {
  key: K;
  tier: SheetTier;
  scopes: readonly string[];
  parts: { [P in SheetPart<K>]: PartSpec<K, P> };
}

export interface StructuresSectionSpec {
  key: 'structures';
  tier: SheetTier;
  scopes: readonly string[];
  parts: 'structures';
}

export type SheetSectionSpec<K extends SheetSectionKey> = K extends DirectSectionKey
  ? DirectSectionSpec<K>
  : StructuresSectionSpec;

export type SheetEsiRead =
  | { kind: 'fresh'; body: unknown; etag: string | null }
  | { kind: 'unchanged' }
  | { kind: 'error'; code: string };

export type SectionPlan<K extends SheetSectionKey> =
  | { kind: 'save'; envelope: SectionEnvelope<K> }
  | { kind: 'stamp' }
  | { kind: 'skip'; code?: string };

export interface SheetPort {
  now(): Date;
  listCharacters(userId: string): Promise<CharacterOwner[]>;
  vendToken(characterId: number): Promise<string | null>;
  readEndpoint(
    characterId: number,
    endpoint: SheetEndpoint,
    accessToken: string,
    heldEtag: string | null,
  ): Promise<SheetEsiRead>;
  readStructure(structureId: number, accessToken: string): Promise<SheetEsiRead>;
  readSheet(characterId: number): Promise<SheetSections | null>;
  mergeSection<K extends SheetSectionKey>(
    characterId: number,
    key: K,
    envelope: SectionEnvelope<K>,
  ): Promise<void>;
  stampSection(characterId: number, key: SheetSectionKey): Promise<void>;
}

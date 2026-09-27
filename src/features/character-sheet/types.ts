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

/** Sections whose data is a fixed set of single-endpoint parts; structures is resolved per id instead. */
export type DirectSectionKey = Exclude<SheetSectionKey, 'structures'>;

export type SheetTier = 'live' | 'hourly' | 'daily';

export const ATTRIBUTE_KEYS = ['intelligence', 'memory', 'perception', 'willpower', 'charisma'] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

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

/** Bounded digest of journal page 1; raw rows are never stored. */
export interface JournalDigest {
  /** The later of (now - 30 d) and the oldest entry on the page: the window the flows really cover. */
  windowStart: string;
  inflow: number;
  outflow: number;
  series: JournalSeriesPoint[];
  recent: JournalEntry[];
}

export interface StructureName {
  /** null = resolved, but this character cannot see the structure. */
  name: string | null;
}

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

export interface SectionEnvelope<K extends SheetSectionKey> {
  /** null only on a denied envelope that had nothing to keep. */
  data: SheetSectionData[K] | null;
  refreshedAt: string;
  etags: PartEtags<K>;
  /** ESI answered 403 after the scope was granted; the board shows reconnect, never this data. */
  denied?: true;
}

export type SheetSections = { [K in SheetSectionKey]?: SectionEnvelope<K> };

export interface SectionSyncState<K extends SheetSectionKey> {
  lastRefreshedAt: Date | null;
  previous: SectionEnvelope<K> | null;
  /** Empty whenever there is no previous data, so a 304 can never leave a part without data. */
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
  /** Empty = public endpoint; the read is still authed, so a refresh token is required. */
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

export interface SheetRefreshCharacter {
  characterId: number;
  hasRefreshToken: boolean;
  missingScopes: string[];
}

export interface SheetPort {
  now(): Date;
  listCharacters(userId: string): Promise<SheetRefreshCharacter[]>;
  vendToken(characterId: number): Promise<string | null>;
  readEndpoint(
    characterId: number,
    endpoint: SheetEndpoint,
    accessToken: string,
    heldEtag: string | null,
  ): Promise<SheetEsiRead>;
  readStructure(structureId: number, accessToken: string): Promise<SheetEsiRead>;
  readSheet(characterId: number): Promise<SheetSections | null>;
  saveSection<K extends SheetSectionKey>(
    characterId: number,
    key: K,
    envelope: SectionEnvelope<K>,
  ): Promise<void>;
  stampSection(characterId: number, key: SheetSectionKey): Promise<void>;
}

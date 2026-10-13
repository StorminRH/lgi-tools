import type { EveScope } from '@/config/eve-scopes';
import type { EsiReadSession } from '@/data/esi-store/session';
import type { CharacterOwner, OwnerWrite, SingleOwnerRead, VendedToken } from '@/platform/owner-sync';
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
  | 'orders'
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

export interface MarketOrder {
  typeId: number;
  volumeRemain: number;
  isBuyOrder: boolean;
  /** ISK held for a buy order; 0 for a sell order. */
  escrow: number;
}

export interface OrdersPart {
  open: MarketOrder[];
}

export interface SheetSectionData {
  profile: { character: CharacterPart };
  status: { location: LocationPart; ship: ShipPart; online: OnlinePart };
  attributes: { attributes: AttributesPart };
  implants: { implants: number[] };
  clones: { clones: ClonesPart };
  wallet: { balance: number };
  journal: { journal: JournalDigest };
  orders: { orders: OrdersPart };
  structures: { names: Record<string, StructureName> };
}

export type SheetPart<K extends SheetSectionKey> = keyof SheetSectionData[K] & string;

/** When the section was last written. Rows written before the response store also carry a `etags` key, which is ignored. */
export interface EnvelopeStamp {
  refreshedAt: string;
}

export interface DataEnvelope<K extends SheetSectionKey> extends EnvelopeStamp {
  data: SheetSectionData[K];
  denied?: never;
}

export interface DeniedEnvelope<K extends SheetSectionKey> extends EnvelopeStamp {
  data: SheetSectionData[K] | null;
  denied: true;
}

export type SectionEnvelope<K extends SheetSectionKey> = DataEnvelope<K> | DeniedEnvelope<K>;

export type SheetSections = { [K in SheetSectionKey]?: SectionEnvelope<K> };

export interface SectionSyncState<K extends SheetSectionKey> {
  previous: SectionEnvelope<K> | null;
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
  | 'journal'
  | 'orders';

export interface PartSpec<K extends DirectSectionKey, P extends SheetPart<K>> {
  endpoint: SheetEndpoint;
  parse(body: unknown, now: Date): SheetSectionData[K][P] | null;
}

export interface DirectSectionSpec<K extends DirectSectionKey> {
  key: K;
  tier: SheetTier;
  scopes: readonly EveScope[];
  parts: { [P in SheetPart<K>]: PartSpec<K, P> };
}

export interface StructuresSectionSpec {
  key: 'structures';
  tier: SheetTier;
  scopes: readonly EveScope[];
  parts: 'structures';
}

export type SheetSectionSpec<K extends SheetSectionKey> = K extends DirectSectionKey
  ? DirectSectionSpec<K>
  : StructuresSectionSpec;

export type SectionPlan<K extends SheetSectionKey> =
  | { kind: 'save'; envelope: SectionEnvelope<K> }
  | { kind: 'stamp' }
  | { kind: 'skip'; code?: string };

export interface SheetPort {
  now(): Date;
  listCharacters(userId: string): Promise<CharacterOwner[]>;
  vendToken(characterId: number): Promise<VendedToken>;
  /** Whether any stored answer the section is built from has expired. */
  isSectionDue(characterId: number, key: DirectSectionKey): Promise<boolean>;
  openSession(): EsiReadSession;
  readEndpoint(
    session: EsiReadSession,
    characterId: number,
    endpoint: SheetEndpoint,
    accessToken: string,
  ): Promise<SingleOwnerRead>;
  readStructure(session: EsiReadSession, structureId: number, accessToken: string): Promise<SingleOwnerRead>;
  readSheet(characterId: number): Promise<SheetSections | null>;
  /** The section's write, which the section sync's commit runs atomically with its answers. */
  mergeSection<K extends SheetSectionKey>(characterId: number, key: K, envelope: SectionEnvelope<K>): OwnerWrite;
  stampSection(characterId: number, key: SheetSectionKey): Promise<void>;
  /** Records a settled refusal (a token that is gone) as the section's stored answers, until `expiresAt` or each route's spec cache time. */
  recordSectionRefusal(characterId: number, key: DirectSectionKey, expiresAt: number | null): Promise<void>;
}

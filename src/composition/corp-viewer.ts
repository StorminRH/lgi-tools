import { after } from 'next/server';
import type { EveScope } from '@/config/eve-scopes';
import { getCorpHoldingContext, readCorpMemberContext } from '@/data/corp-holdings/queries';
import type { Knowable } from '@/data/corp-holdings/placement';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import type { UserCorpAccess } from '@/platform/auth/corp-access';
import { narrowCorpRoles } from '@/platform/auth/corp-roles';
import { readCorpRoles, type StoredCorpRoles } from '@/platform/auth/corp-roles-store';
import { readCorpSharing } from '@/platform/auth/corp-sharing-store';
import {
  compileCorpGrant,
  compileReadScope,
  type CorpGrant,
  type CorpGrantInput,
  type MemberRoles,
  type OwnedReadScope,
  type SharingState,
} from '@/platform/auth/corp-visibility';
import { resolveUserCorpAccess } from './corp-access';
import { refreshCorpContextOnView } from './sync/corp-context-sync';
import { fetchAndStoreCorpRoles, type LinkedCharacterHealth, listCharactersWithHealth } from './sync/owner-sync-port';

export interface CorpViewerCorporation {
  readonly corporationId: number;
  readonly sharing: SharingState;
  readonly grant: CorpGrant;
}

export interface CorpViewer {
  readonly scope: OwnedReadScope;
  readonly corporations: readonly CorpViewerCorporation[];
}

const ROLES_FRESHNESS = freshnessGate('character_corp_roles');
const ROLES_SCOPE: EveScope = 'esi-characters.read_corporation_roles.v1';
const UNKNOWN: MemberRoles = { kind: 'unknown' };
const CONTEXT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const NO_KNOWN_BASES: ReadonlyMap<number, number | null> = new Map();

interface RoleSources {
  readonly stored: ReadonlyMap<number, StoredCorpRoles>;
  readonly health: ReadonlyMap<number, LinkedCharacterHealth>;
  readonly now: Date;
}

function usableStoredRoles(
  row: StoredCorpRoles | undefined,
  corporationId: number,
  now: Date,
): row is StoredCorpRoles {
  return row !== undefined && row.corporationId === corporationId && !ROLES_FRESHNESS.isStale(row.fetchedAt, now);
}

function canFetchRoles(health: LinkedCharacterHealth | undefined): boolean {
  return health !== undefined && health.hasRefreshToken && !health.missingScopes.includes(ROLES_SCOPE);
}

async function fetchedRolesOrUnknown(characterId: number, corporationId: number): Promise<MemberRoles> {
  try {
    const record = await fetchAndStoreCorpRoles(characterId);
    return record === null || record.corporationId !== corporationId ? UNKNOWN : { kind: 'known', roles: narrowCorpRoles(record) };
  } catch {
    return UNKNOWN;
  }
}

function memberRoles(characterId: number, corporationId: number, sources: RoleSources): Promise<MemberRoles> {
  const row = sources.stored.get(characterId);
  if (usableStoredRoles(row, corporationId, sources.now)) {
    return Promise.resolve({ kind: 'known', roles: narrowCorpRoles(row) });
  }
  return canFetchRoles(sources.health.get(characterId)) ? fetchedRolesOrUnknown(characterId, corporationId) : Promise.resolve(UNKNOWN);
}

function contextIsFresh(profile: { lastRefreshedAt: Date } | null, now: Date): boolean {
  return profile !== null && now.getTime() - profile.lastRefreshedAt.getTime() <= CONTEXT_MAX_AGE_MS;
}

function baseOf(bases: ReadonlyMap<number, number | null>, characterId: number): Knowable<number | null> {
  return bases.has(characterId) ? { kind: 'known', value: bases.get(characterId) ?? null } : { kind: 'unknown' };
}

async function resolveCorporation(
  corporationId: number,
  characterIds: readonly number[],
  sharing: SharingState,
  sources: RoleSources,
): Promise<CorpViewerCorporation> {
  const [cachedContext, profile, roles] = await Promise.all([
    getCorpHoldingContext(corporationId),
    readCorpMemberContext(corporationId, characterIds),
    Promise.all(characterIds.map((characterId) => memberRoles(characterId, corporationId, sources))),
  ]);
  const fresh = contextIsFresh(profile, sources.now);
  const knownBases = fresh && profile !== null ? profile.bases : NO_KNOWN_BASES;
  const hq: Knowable<number> = fresh && profile?.hqStationId != null
    ? { kind: 'known', value: profile.hqStationId }
    : { kind: 'unknown' };
  const context = { ...cachedContext, hq };
  const members: CorpGrantInput['members'] = characterIds.map((characterId, i) => ({
    characterId,
    roles: roles[i] ?? UNKNOWN,
    base: baseOf(knownBases, characterId),
  }));
  return { corporationId, sharing, grant: compileCorpGrant({ corporationId, sharing, context, members }) };
}

function membersOf(access: UserCorpAccess, corporationId: number): readonly number[] {
  return access.characterIdsByCorporation[corporationId] ?? [];
}

export async function resolveCorpViewer(userId: string): Promise<CorpViewer> {
  const now = new Date();
  const [access, health] = await Promise.all([resolveUserCorpAccess(userId), listCharactersWithHealth(userId)]);
  const corporationIds = [...access.corporationIds];
  const [sharing, stored] = await Promise.all([
    readCorpSharing(corporationIds),
    readCorpRoles(corporationIds.flatMap((corporationId) => membersOf(access, corporationId))),
  ]);
  const sources: RoleSources = {
    stored,
    health: new Map(health.map((character) => [character.characterId, character])),
    now,
  };
  const corporations = await Promise.all(
    corporationIds.map((corporationId) =>
      resolveCorporation(corporationId, membersOf(access, corporationId), sharing.get(corporationId) ?? 'off', sources),
    ),
  );
  after(() => refreshCorpContextOnView(userId));
  return {
    scope: compileReadScope([...access.allCharacterIds], corporations.map((corporation) => corporation.grant)),
    corporations,
  };
}

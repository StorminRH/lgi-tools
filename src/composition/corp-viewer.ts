import { after } from 'next/server';
import type { EveScope } from '@/config/eve-scopes';
import { getCorpHoldingContext, readCorpMemberContext } from '@/data/corp-holdings/queries';
import type { Knowable } from '@/data/corp-holdings/placement';
import { hasScopes } from '@/lib/scope-eligibility';
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
import type { EnumeratedOwner } from '@/platform/owner-sync';
import { resolveUserCorpAccess } from './corp-access';
import { refreshCorpContextOnView } from './sync/corp-context-sync';
import {
  fetchCorpRolesForMembers,
  listCharactersWithHealth,
  type RolesOutcome,
  usableStoredRoles,
} from './sync/owner-sync-port';

export interface CorpViewerCorporation {
  readonly corporationId: number;
  readonly sharing: SharingState;
  readonly grant: CorpGrant;
}

export interface CorpViewer {
  readonly scope: OwnedReadScope;
  readonly corporations: readonly CorpViewerCorporation[];
}

const ROLES_SCOPE: EveScope = 'esi-characters.read_corporation_roles.v1';
const UNKNOWN: MemberRoles = { kind: 'unknown' };
const NO_KNOWN_BASES: ReadonlyMap<number, number | null> = new Map();

interface RoleSources {
  readonly stored: ReadonlyMap<number, StoredCorpRoles>;
  readonly now: Date;
  /** The roles fetched for every member whose stored row the viewer cannot use, across all its corporations. */
  readonly fetched: Promise<ReadonlyMap<number, RolesOutcome>>;
}

function canFetchRoles(health: EnumeratedOwner | undefined): boolean {
  return health !== undefined && hasScopes(health, [ROLES_SCOPE]);
}

/** The members, across every corporation, whose stored roles have expired or bind elsewhere and who can read their roles. */
function membersToFetch(
  access: UserCorpAccess,
  stored: ReadonlyMap<number, StoredCorpRoles>,
  health: ReadonlyMap<number, EnumeratedOwner>,
  now: Date,
): number[] {
  return [...access.corporationIds].flatMap((corporationId) =>
    membersOf(access, corporationId).filter((characterId) =>
      !usableStoredRoles(stored.get(characterId), corporationId, now) && canFetchRoles(health.get(characterId))));
}

/** One batch for the whole viewer; a failure leaves every fetched member's roles unknown. */
async function fetchRoles(characterIds: readonly number[]): Promise<ReadonlyMap<number, RolesOutcome>> {
  if (characterIds.length === 0) return new Map();
  try {
    return await fetchCorpRolesForMembers(characterIds);
  } catch {
    return new Map();
  }
}

function fetchedRolesOrUnknown(outcome: RolesOutcome | undefined, corporationId: number): MemberRoles {
  const record = outcome?.status === 'fulfilled' ? outcome.value : null;
  return record === null || record.corporationId !== corporationId ? UNKNOWN : { kind: 'known', roles: narrowCorpRoles(record) };
}

function memberRoles(
  characterId: number,
  corporationId: number,
  sources: RoleSources,
  fetched: ReadonlyMap<number, RolesOutcome>,
): MemberRoles {
  const row = sources.stored.get(characterId);
  if (usableStoredRoles(row, corporationId, sources.now)) return { kind: 'known', roles: narrowCorpRoles(row) };
  return fetchedRolesOrUnknown(fetched.get(characterId), corporationId);
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
  const [cachedContext, profile, fetched] = await Promise.all([
    getCorpHoldingContext(corporationId),
    readCorpMemberContext(corporationId, characterIds),
    sources.fetched,
  ]);
  // Stored HQ and bases count as current until a Director's visit refreshes them;
  // the members' own roles, expiring at CCP's time, are the permission check.
  const knownBases = profile?.bases ?? NO_KNOWN_BASES;
  const hq: Knowable<number> = profile?.hqStationId != null
    ? { kind: 'known', value: profile.hqStationId }
    : { kind: 'unknown' };
  const context = { ...cachedContext, hq };
  const members: CorpGrantInput['members'] = characterIds.map((characterId) => ({
    characterId,
    roles: memberRoles(characterId, corporationId, sources, fetched),
    base: baseOf(knownBases, characterId),
  }));
  return { corporationId, sharing, grant: compileCorpGrant({ corporationId, sharing, context, members }) };
}

function membersOf(access: UserCorpAccess, corporationId: number): readonly number[] {
  return access.characterIdsByCorporation[corporationId] ?? [];
}

/**
 * The viewer's corporations and grants from stored roles, fetching
 * members' roles inline only where the stored row has expired, all of
 * them in one batch whose live affiliation checks are shared. It
 * schedules nothing, so a page render may call it: refreshes clear cache
 * tags, which a render cannot do.
 */
export async function readCorpViewer(userId: string): Promise<CorpViewer> {
  const now = new Date();
  const [access, health] = await Promise.all([resolveUserCorpAccess(userId), listCharactersWithHealth(userId)]);
  const corporationIds = [...access.corporationIds];
  const [sharing, stored] = await Promise.all([
    readCorpSharing(corporationIds),
    readCorpRoles(corporationIds.flatMap((corporationId) => membersOf(access, corporationId))),
  ]);
  const healthById = new Map(health.map((character) => [character.characterId, character]));
  const sources: RoleSources = { stored, now, fetched: fetchRoles(membersToFetch(access, stored, healthById, now)) };
  const corporations = await Promise.all(
    corporationIds.map((corporationId) =>
      resolveCorporation(corporationId, membersOf(access, corporationId), sharing.get(corporationId) ?? 'off', sources),
    ),
  );
  return {
    scope: compileReadScope([...access.allCharacterIds], corporations.map((corporation) => corporation.grant)),
    corporations,
  };
}

/**
 * The viewer as readCorpViewer draws it, with the corp context refreshed
 * behind the response. For route handlers only: the refresh clears cache
 * tags, which revalidateTag allows there and not in a page render.
 */
export async function resolveCorpViewer(userId: string): Promise<CorpViewer> {
  const viewer = await readCorpViewer(userId);
  after(() => refreshCorpContextOnView(userId));
  return viewer;
}

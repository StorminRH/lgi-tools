// Corp industry-jobs composition layer (MIGRATE.B.3). Lives here, above the slices,
// because it is the only point that touches BOTH the auth slice (per-character token
// vend, affiliation/role reads) AND the industry-jobs slice (the ESI→projection + Neon
// storage) — a cross-slice join the feature boundary forbids inside either slice (the
// sde-pipeline.ts pattern). This wires the real corp port the pure refresh runs over,
// and exposes the on-view seam the corp-jobs API route consumes: read the cached
// per-corp boards, fire a stale-gated write-behind refresh behind the response (zero
// added latency). A direct mirror of src/db/industry-jobs-sync.ts, corp-keyed, with the
// owned-blueprints/assets corp-director resolution (vend + roles read) — NOT corpSync.
import { after } from 'next/server';
import { getTypeNames } from '@/data/eve-data/queries';
import { getFreshAccessTokenForCharacter } from '@/features/auth/eve-token-service';
import { listLinkedCharacters } from '@/features/auth/queries';
import { deriveCharacterHealth } from '@/features/auth/scope-health';
import { refreshCorpJobsForUser } from '@/features/industry-jobs/corp-refresh';
import { jobTypeIds } from '@/features/industry-jobs/esi-projection';
import {
  getCorpJobsForUser,
  listCorpJobSyncStates,
  readCorpJobSyncState,
  saveCorpJobs,
  saveCorpNeedsRole,
  stampCorpJobsFresh,
} from '@/features/industry-jobs/queries';
import type { CharacterJobsData, CorpJobsPort, JobsEsiRead } from '@/features/industry-jobs/types';
import { EsiBudgetExhaustedError, EsiServerError } from '@/lib/esi';
import { type EsiAuthedRead, readEsiAuthed } from '@/lib/esi/authed-read';

// Map ESI's role body ({ roles?: string[] }) to a plain string list. Defensive (ESI is
// an external boundary): a missing/foreign shape reads as no roles.
function extractRoles(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return [];
  const roles = (body as { roles?: unknown }).roles;
  return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : [];
}

// Map lib/esi's read result into the slice's port contract (dropping the ESI cache
// window the Neon path's fixed TTL ignores). Budget exhaustion / 5xx throw out of
// esiFetch and are swallowed to a soft 'error' skip (best-effort per corp).
function toJobsEsiRead(read: EsiAuthedRead): JobsEsiRead {
  if (read.kind === 'fresh') return { kind: 'fresh', body: read.body, etag: read.etag };
  if (read.kind === 'unchanged') return { kind: 'unchanged' };
  return { kind: 'error', code: read.code };
}

async function readCorpJobsEndpoint(
  corporationId: number,
  accessToken: string,
  heldEtag: string | null,
): Promise<JobsEsiRead> {
  try {
    return toJobsEsiRead(
      await readEsiAuthed(`/corporations/${corporationId}/industry/jobs/`, accessToken, heldEtag),
    );
  } catch (error) {
    if (error instanceof EsiBudgetExhaustedError) return { kind: 'error', code: 'budget_exhausted' };
    if (error instanceof EsiServerError) return { kind: 'error', code: 'esi_server_error' };
    throw error;
  }
}

// The real corp port. Auth + ESI + Neon, each method mapping its underlying result into
// the slice's port contract.
function makeCorpJobsPort(): CorpJobsPort {
  return {
    now: () => new Date(),

    async listMembers(userId: string) {
      const linked = await listLinkedCharacters(userId);
      return linked.map((character) => ({
        characterId: character.characterId,
        corporationId: character.corporationId,
        hasRefreshToken: character.hasRefreshToken,
        missingScopes: deriveCharacterHealth({
          scope: character.scope,
          hasRefreshToken: character.hasRefreshToken,
        }).missingScopes,
      }));
    },

    async vendToken(characterId: number) {
      const result = await getFreshAccessTokenForCharacter(characterId);
      return result.kind === 'ok' ? result.accessToken : null;
    },

    async readRoles(characterId: number, accessToken: string) {
      try {
        const read = await readEsiAuthed(`/characters/${characterId}/roles`, accessToken, null);
        return read.kind === 'fresh' ? extractRoles(read.body) : null;
      } catch (error) {
        if (error instanceof EsiBudgetExhaustedError || error instanceof EsiServerError) return null;
        throw error;
      }
    },

    readJobs: (corporationId, accessToken, heldEtag) =>
      readCorpJobsEndpoint(corporationId, accessToken, heldEtag),

    readSyncState: (userId, corporationId) => readCorpJobSyncState(userId, corporationId),
    saveJobs: (userId, corporationId, jobs, etag) => saveCorpJobs(userId, corporationId, jobs, etag),
    saveNeedsRole: (userId, corporationId) => saveCorpNeedsRole(userId, corporationId),
    stampFresh: (userId, corporationId) => stampCorpJobsFresh(userId, corporationId),
  };
}

// One corp's board for the wire: the cached payload (null when needs_role / un-synced)
// plus the "as of" stamp and the graceful per-corp error state. The client joins this
// with the corp + installer names it resolves via /api/eve/names.
export interface ViewerCorpJobs {
  corporationId: number;
  data: CharacterJobsData | null;
  lastRefreshedAt: number | null;
  syncError: string | null;
}

// The on-view payload: the per-corp boards + one shared type-id→name map (blueprint +
// product names) resolved server-side from the SDE, keyed by String(typeId).
export interface ViewerCorpJobsResult {
  corporations: ViewerCorpJobs[];
  names: Record<string, string>;
}

// The on-view seam: read the user's current corp boards + freshness immediately,
// resolve the referenced type names from the SDE, and fire a stale-gated write-behind
// refresh behind the response. A re-view inside the 300s window makes no ESI call (the
// refresh's per-corp staleness gate is the dedup). The corp set is the user's sync rows
// (the board table is corp-keyed but not user-enumerable on its own); on a first-ever
// view there are no rows yet — the client's cold reconcile re-fetches once the
// write-behind has populated. The cached boards + the uncached sync states are read in
// parallel.
export async function getCorpJobsForUserOnView(userId: string): Promise<ViewerCorpJobsResult> {
  const syncStates = await listCorpJobSyncStates(userId);
  const corporationIds = syncStates.map((state) => state.corporationId);
  const dataMap = await getCorpJobsForUser(userId, corporationIds);
  after(() => refreshCorpJobsForUser(makeCorpJobsPort(), userId));

  const corporations: ViewerCorpJobs[] = syncStates.map((state) => ({
    corporationId: state.corporationId,
    data: dataMap.get(state.corporationId) ?? null,
    lastRefreshedAt: state.lastRefreshedAt?.getTime() ?? null,
    syncError: state.syncError,
  }));

  const nameMap = await getTypeNames([...new Set(jobTypeIds(corporations))]);
  const names: Record<string, string> = {};
  for (const [id, name] of nameMap) names[String(id)] = name;

  return { corporations, names };
}

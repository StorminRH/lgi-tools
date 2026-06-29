// Personal industry-jobs composition layer (MIGRATE.B.2). Lives here, above the slices,
// because it is the only point that touches BOTH the auth slice (per-character token
// vend, scope reads) AND the industry-jobs slice (the ESI→projection + Neon storage) — a
// cross-slice join the feature boundary forbids inside either slice (the sde-pipeline.ts
// pattern, mirroring skills-sync.ts). This wires the real port the pure refresh runs
// over, and exposes the on-view seam the industry-jobs API route consumes: read the
// cached per-character boards, fire a stale-gated write-behind refresh behind the
// response (zero added latency). A job's live "ready" is derived client-side from its
// absolute end_date (no scheduler); the first-view cold cache is populated by the
// client's auto-reconcile re-fetch, so the seam stays template-pure write-behind (never
// awaits the refresh).
import { after } from 'next/server';
import { getTypeNames } from '@/data/eve-data/queries';
import { getFreshAccessTokenForCharacter } from '@/features/auth/eve-token-service';
import { listLinkedCharacters } from '@/features/auth/queries';
import { deriveCharacterHealth } from '@/features/auth/scope-health';
import { jobTypeIds } from '@/features/industry-jobs/esi-projection';
import {
  getJobsForCharacters,
  readCharacterJobSyncState,
  saveCharacterJobs,
  stampCharacterJobsFresh,
} from '@/features/industry-jobs/queries';
import { refreshJobsForUser } from '@/features/industry-jobs/refresh';
import type { CharacterJobsData, JobsEsiRead, JobsPort } from '@/features/industry-jobs/types';
import { EsiBudgetExhaustedError, EsiServerError } from '@/lib/esi';
import { type EsiAuthedRead, readEsiAuthed } from '@/lib/esi/authed-read';

// Map lib/esi's read result into the slice's port contract (dropping the ESI cache
// window the Neon path's fixed TTL ignores). Budget exhaustion / 5xx throw out of
// esiFetch and are swallowed to a soft 'error' skip (best-effort per character).
function toJobsEsiRead(read: EsiAuthedRead): JobsEsiRead {
  if (read.kind === 'fresh') return { kind: 'fresh', body: read.body, etag: read.etag };
  if (read.kind === 'unchanged') return { kind: 'unchanged' };
  return { kind: 'error', code: read.code };
}

async function readJobsEndpoint(
  characterId: number,
  accessToken: string,
  heldEtag: string | null,
): Promise<JobsEsiRead> {
  try {
    return toJobsEsiRead(
      await readEsiAuthed(`/characters/${characterId}/industry/jobs/`, accessToken, heldEtag),
    );
  } catch (error) {
    if (error instanceof EsiBudgetExhaustedError) return { kind: 'error', code: 'budget_exhausted' };
    if (error instanceof EsiServerError) return { kind: 'error', code: 'esi_server_error' };
    throw error;
  }
}

// The real port. Auth + ESI + Neon, each method mapping its underlying result into the
// slice's port contract.
function makeJobsPort(): JobsPort {
  return {
    now: () => new Date(),

    async listCharacters(userId: string) {
      const linked = await listLinkedCharacters(userId);
      return linked.map((character) => ({
        characterId: character.characterId,
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

    readJobs: (characterId, accessToken, heldEtag) =>
      readJobsEndpoint(characterId, accessToken, heldEtag),

    readSyncState: (characterId) => readCharacterJobSyncState(characterId),
    saveJobs: (characterId, jobs, etag) => saveCharacterJobs(characterId, jobs, etag),
    stampFresh: (characterId) => stampCharacterJobsFresh(characterId),
  };
}

// One character's board for the wire: the cached payload (null until first sync) plus
// the "as of" stamp. The client joins this with its character list (names/portraits/
// scope health) by characterId.
export interface ViewerJobs {
  characterId: number;
  data: CharacterJobsData | null;
  lastRefreshedAt: number | null;
}

// The on-view payload: the per-character boards + one shared type-id→name map. Names are
// resolved server-side from the SDE (blueprint + product types), so the client needs no
// separate name fetch — keyed by String(typeId), the shape the UI's `names[String(id)]`
// lookups expect.
export interface ViewerJobsResult {
  characters: ViewerJobs[];
  names: Record<string, string>;
}

// The on-view seam: read the current per-character boards + freshness immediately,
// resolve the referenced type names from the SDE, and fire a stale-gated write-behind
// refresh behind the response. A re-view inside the 300s window makes no ESI call (the
// refresh's per-character staleness gate is the dedup). The cached payload + the uncached
// sync-state stamp are read in parallel.
export async function getJobsForUserOnView(userId: string): Promise<ViewerJobsResult> {
  const linked = await listLinkedCharacters(userId);
  const characterIds = linked.map((character) => character.characterId);
  const [dataMap, syncStates] = await Promise.all([
    getJobsForCharacters(characterIds),
    Promise.all(characterIds.map((id) => readCharacterJobSyncState(id))),
  ]);
  after(() => refreshJobsForUser(makeJobsPort(), userId));

  const characters: ViewerJobs[] = characterIds.map((characterId, i) => ({
    characterId,
    data: dataMap.get(characterId) ?? null,
    lastRefreshedAt: syncStates[i]?.lastRefreshedAt?.getTime() ?? null,
  }));

  const nameMap = await getTypeNames([...new Set(jobTypeIds(characters))]);
  const names: Record<string, string> = {};
  for (const [id, name] of nameMap) names[String(id)] = name;

  return { characters, names };
}

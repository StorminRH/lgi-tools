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
// awaits the refresh). The shared auth + ESI port wiring lives in owner-sync-port.ts.
import { after } from 'next/server';
import { getTypeNames } from '@/data/eve-data/queries';
import { listLinkedCharacters } from '@/features/auth/queries';
import { jobTypeIds } from '@/features/industry-jobs/esi-projection';
import {
  getJobsForCharacters,
  readCharacterJobSyncState,
  saveCharacterJobs,
  stampCharacterJobsFresh,
} from '@/features/industry-jobs/queries';
import { refreshJobsForUser } from '@/features/industry-jobs/refresh';
import type { CharacterJobsData, JobsPort } from '@/features/industry-jobs/types';
import { listCharactersWithHealth, readSingleEndpoint, vendTokenFor } from './owner-sync-port';

// The real port: the shared auth + ESI wiring (owner-sync-port.ts) plus this slice's
// own Neon read/save/stamp. Jobs reads one single-page endpoint (readSingleEndpoint).
function makeJobsPort(): JobsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readJobs: (characterId, accessToken, heldEtag) =>
      readSingleEndpoint(`/characters/${characterId}/industry/jobs/`, accessToken, heldEtag),
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

// Skill-queue composition layer (MIGRATE.B.1). Lives here, above the slices, because
// it is the only point that touches BOTH the auth slice (per-character token vend,
// scope reads) AND the skill-queue slice (the ESI→projection + Neon storage) — a
// cross-slice join the feature boundary forbids inside either slice (the
// sde-pipeline.ts pattern, mirroring owned-blueprints-sync.ts). This wires the real
// port the pure refresh runs over, and exposes the on-view seam the skills API route
// consumes: read the cached per-character skills, fire a stale-gated write-behind
// refresh behind the response (zero added latency). The queue's live progress is
// derived client-side from each entry's absolute finish_date; the first-view cold
// cache is populated by the client's auto-reconcile re-fetch, so the seam stays
// template-pure write-behind (never awaits the refresh).
import { after } from 'next/server';
import { getTypeNames } from '@/data/eve-data/queries';
import { getFreshAccessTokenForCharacter } from '@/features/auth/eve-token-service';
import { listLinkedCharacters } from '@/features/auth/queries';
import { deriveCharacterHealth } from '@/features/auth/scope-health';
import {
  getSkillsForCharacters,
  readCharacterSyncState,
  saveCharacterSkills,
  stampCharacterFresh,
} from '@/features/skill-queue/queries';
import { refreshSkillsForUser } from '@/features/skill-queue/refresh';
import type {
  CharacterSkillData,
  RefreshCharacter,
  SkillsEsiRead,
  SkillsPort,
} from '@/features/skill-queue/types';
import { EsiBudgetExhaustedError, EsiServerError } from '@/lib/esi';
import { type EsiAuthedRead, readEsiAuthed } from '@/lib/esi/authed-read';

// Map lib/esi's read result into the slice's port contract (dropping the ESI cache
// window the Neon path's fixed TTL ignores). Budget exhaustion / 5xx throw out of
// esiFetch and are swallowed to a soft 'error' skip (best-effort per character).
function toSkillsEsiRead(read: EsiAuthedRead): SkillsEsiRead {
  if (read.kind === 'fresh') return { kind: 'fresh', body: read.body, etag: read.etag };
  if (read.kind === 'unchanged') return { kind: 'unchanged' };
  return { kind: 'error', code: read.code };
}

async function readSkillsEndpoint(
  path: string,
  accessToken: string,
  heldEtag: string | null,
): Promise<SkillsEsiRead> {
  try {
    return toSkillsEsiRead(await readEsiAuthed(path, accessToken, heldEtag));
  } catch (error) {
    if (error instanceof EsiBudgetExhaustedError) return { kind: 'error', code: 'budget_exhausted' };
    if (error instanceof EsiServerError) return { kind: 'error', code: 'esi_server_error' };
    throw error;
  }
}

// The real port. Auth + ESI + Neon, each method mapping its underlying result into
// the slice's port contract.
function makeSkillsPort(): SkillsPort {
  return {
    now: () => new Date(),

    async listCharacters(userId: string): Promise<RefreshCharacter[]> {
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

    async vendToken(characterId: number): Promise<string | null> {
      const result = await getFreshAccessTokenForCharacter(characterId);
      return result.kind === 'ok' ? result.accessToken : null;
    },

    readSkillQueue: (characterId, accessToken, heldEtag) =>
      readSkillsEndpoint(`/characters/${characterId}/skillqueue/`, accessToken, heldEtag),
    readSkills: (characterId, accessToken, heldEtag) =>
      readSkillsEndpoint(`/characters/${characterId}/skills/`, accessToken, heldEtag),

    readSyncState: (characterId) => readCharacterSyncState(characterId),
    saveSkills: (characterId, halves) => saveCharacterSkills(characterId, halves),
    stampFresh: (characterId) => stampCharacterFresh(characterId),
  };
}

// One character's skills for the wire: the cached payload (null until first sync) plus
// the "as of" stamp. The client joins this with its character list (names/portraits/
// scope health) by characterId.
export interface ViewerSkills {
  characterId: number;
  data: CharacterSkillData | null;
  lastRefreshedAt: number | null;
}

// The on-view payload: the per-character skills + one shared skill-id→name map. Names
// are resolved server-side from the SDE (like owned-blueprints' resolveEntityNames),
// so the client needs no separate name fetch — keyed by String(skillId), the shape the
// UI's `names[String(id)]` lookups expect.
export interface ViewerSkillsResult {
  characters: ViewerSkills[];
  names: Record<string, string>;
}

// The on-view seam: read the current per-character skills + freshness immediately,
// resolve the queued skill names from the SDE, and fire a stale-gated write-behind
// refresh behind the response. A re-view inside the 120s window makes no ESI call (the
// refresh's per-character staleness gate is the dedup). The cached payload + the
// uncached sync-state stamp are read in parallel.
export async function getSkillsForUserOnView(userId: string): Promise<ViewerSkillsResult> {
  const linked = await listLinkedCharacters(userId);
  const characterIds = linked.map((character) => character.characterId);
  const [dataMap, syncStates] = await Promise.all([
    getSkillsForCharacters(characterIds),
    Promise.all(characterIds.map((id) => readCharacterSyncState(id))),
  ]);
  after(() => refreshSkillsForUser(makeSkillsPort(), userId));

  const characters: ViewerSkills[] = characterIds.map((characterId, i) => ({
    characterId,
    data: dataMap.get(characterId) ?? null,
    lastRefreshedAt: syncStates[i]?.lastRefreshedAt?.getTime() ?? null,
  }));

  const skillIds = new Set<number>();
  for (const character of characters) {
    for (const entry of character.data?.entries ?? []) skillIds.add(entry.skill_id);
  }
  const nameMap = await getTypeNames([...skillIds]);
  const names: Record<string, string> = {};
  for (const [id, name] of nameMap) names[String(id)] = name;

  return { characters, names };
}

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
// template-pure write-behind (never awaits the refresh). The shared auth + ESI port
// wiring lives in owner-sync-port.ts (MIGRATE.D.2).
import { after } from 'next/server';
import { listLinkedCharacters } from '@/features/auth/linked-characters';
import {
  getCharacterSkillLevels,
  getSkillLevelsForCharacters,
  getSkillsForCharacters,
  readCharacterSyncState,
  saveCharacterSkills,
  stampCharacterFresh,
} from '@/features/skill-queue/queries';
import { refreshSkillsForUser } from '@/features/skill-queue/refresh';
import type { CharacterSkillData, SkillsPort } from '@/features/skill-queue/types';
import type { OwnerSyncResult, OwnerSyncTarget } from '@/lib/owner-sync';
import { characterRow, getLiveDatasetOnView, readCharacterOwners } from './live-dataset-view';
import { listCharactersWithHealth, readSingleEndpoint, vendTokenFor } from './owner-sync-port';
import { enqueueBudgetDeferral, targetedOwnerResult } from './esi-refresh-owner-sync';

// The real port: the shared auth + ESI wiring (owner-sync-port.ts) plus this slice's
// own Neon read/save/stamp. Skills reads two single-page endpoints (readSingleEndpoint).
function makeSkillsPort(): SkillsPort {
  return {
    now: () => new Date(),
    listCharacters: listCharactersWithHealth,
    vendToken: vendTokenFor,
    readSkillQueue: (characterId, accessToken, heldEtag) =>
      readSingleEndpoint(`/characters/${characterId}/skillqueue/`, accessToken, heldEtag),
    readSkills: (characterId, accessToken, heldEtag) =>
      readSingleEndpoint(`/characters/${characterId}/skills/`, accessToken, heldEtag),
    readSyncState: (characterId) => readCharacterSyncState(characterId),
    saveSkills: (characterId, halves) => saveCharacterSkills(characterId, halves),
    stampFresh: (characterId) => stampCharacterFresh(characterId),
  };
}

/**
 * One character's skills for the wire: the cached payload (null until first sync) plus
 * the "as of" stamp. The client joins this with its character list (names/portraits/
 * scope health) by characterId.
 */
export interface ViewerSkills {
  characterId: number;
  data: CharacterSkillData | null;
  lastRefreshedAt: number | null;
}

/**
 * The on-view payload: the per-character skills + one shared skill-id→name map. Names
 * are resolved server-side from the SDE (like owned-blueprints' resolveEntityNames),
 * so the client needs no separate name fetch — keyed by String(skillId), the shape the
 * UI's `names[String(id)]` lookups expect.
 */
export interface ViewerSkillsResult {
  characters: ViewerSkills[];
  names: Record<string, string>;
}

/**
 * The on-view seam: read the current per-character skills + freshness immediately,
 * resolve the queued skill names from the SDE, and fire a stale-gated write-behind
 * refresh behind the response (the shared getLiveDatasetOnView tail). A re-view inside
 * the 120s window makes no ESI call (the refresh's per-character staleness gate is the
 * dedup). The cached payload + the uncached sync-state stamp are read in parallel
 * (readCharacterOwners).
 */
export async function getSkillsForUserOnView(userId: string): Promise<ViewerSkillsResult> {
  const { rows, names } = await getLiveDatasetOnView<CharacterSkillData, ViewerSkills>(userId, {
    read: (uid) => readCharacterOwners(uid, getSkillsForCharacters, readCharacterSyncState),
    refresh: (uid) =>
      refreshSkillsForUser(makeSkillsPort(), uid, enqueueBudgetDeferral('skills', uid)),
    makeRow: characterRow,
    nameIds: (viewerSkills) => {
      const skillIds = new Set<number>();
      for (const character of viewerSkills) {
        for (const entry of character.data?.entries ?? []) skillIds.add(entry.skill_id);
      }
      return skillIds;
    },
  });
  return { characters: rows, names };
}

/**
 * One character's trained levels for the wire; null = never synced / pre-0039
 * row — the fail-open signal (base slot capacity downstream), distinct from a
 * present map lacking a skill (rank 0).
 */
export interface ViewerSkillLevels {
  characterId: number;
  levels: Record<string, number> | null;
}

/**
 * The slots readout's batched on-view levels read (3.7.24): every linked
 * character's trained levels in one pass, mirroring getSkillsForUserOnView.
 * Fires exactly ONE write-behind per view; refreshSkillsForUser checks each
 * character's lastRefreshedAt against the 120s staleness gate BEFORE any token
 * vend or ESI call, so a re-view inside the window is a pure Neon read — there
 * is no unconditional N-character refresh storm.
 */
export async function getSkillLevelsForUserOnView(userId: string): Promise<ViewerSkillLevels[]> {
  const linked = await listLinkedCharacters(userId);
  const characterIds = linked.map((character) => character.characterId);
  const levelsMap = await getSkillLevelsForCharacters(characterIds);
  after(() =>
    refreshSkillsForUser(makeSkillsPort(), userId, enqueueBudgetDeferral('skills', userId)),
  );
  return characterIds.map((characterId) => ({
    characterId,
    levels: levelsMap.get(characterId) ?? null,
  }));
}

/**
 * The planner's on-view levels read (3.7.19.1): one character's trained active
 * levels, ownership-checked against the caller's linked characters. Every arm
 * fails open to null (not-owned, never-synced, pre-0039 row) — the skills→time
 * lever renders the no-skill baseline, never an error. Fires the same
 * stale-gated write-behind as the skills page, so planner views keep levels
 * fresh under the 120s gate with zero added latency.
 */
export async function getSkillLevelsForCharacterOnView(
  userId: string,
  characterId: number,
): Promise<Record<string, number> | null> {
  const linked = await listLinkedCharacters(userId);
  if (!linked.some((character) => character.characterId === characterId)) return null;
  const levels = await getCharacterSkillLevels(characterId);
  after(() =>
    refreshSkillsForUser(makeSkillsPort(), userId, enqueueBudgetDeferral('skills', userId)),
  );
  return levels;
}

/**
 * Refreshes one character's skills through the shared owner-sync pipeline and returns the
 * normalized freshness and source outcome.
 */
export async function runSkillsRefreshJob(
  userId: string,
  target: OwnerSyncTarget,
): Promise<OwnerSyncResult> {
  const results = await refreshSkillsForUser(makeSkillsPort(), userId, { target });
  return targetedOwnerResult(target, results);
}

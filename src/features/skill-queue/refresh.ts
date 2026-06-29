// The on-view skill-queue refresh (MIGRATE.B.1; engine-backed since MIGRATE.D.2).
// PURE orchestration: refreshSkillsForUser builds an OwnerSyncDescriptor from the
// injected port (types.ts) + this slice's pure helpers and hands it to the shared
// per-owner sync engine (src/lib/owner-sync). It imports no auth and no DB, so it
// stays inside the feature boundary and is unit-tested with a fake port. The real
// port is wired in src/db/skills-sync.ts. Skills is per-character only — one parallel
// pass, no corp axis.
//
// The engine checks the staleness gate BEFORE any token vend or ESI call (a fresh
// character does zero work). The dual-endpoint partial-304 merge is the only
// skill-queue specific — it lives in planSkillsPersist below, which the engine treats
// as an opaque save / stamp / skip verdict; refresh.test.ts pins the byte-identical
// behaviour.
import { type OwnerSyncDescriptor, runOwnerSync } from '@/lib/owner-sync';
import { parseSkillQueueBody, parseSkillsBody } from './esi-projection';
import { isSkillsStale } from './staleness';
import { canSyncSkillQueue } from './sync-eligibility';
import type { CharacterSkillSyncState, SkillsEsiRead, SkillsPort, SkillsSaveHalves } from './types';

// What a refresh should persist from the two endpoint reads. PURE + tested, so the
// merge/304 logic stays out of the I/O orchestration. 'skip' = an ESI error or a
// contract mismatch on a fresh half (keep stored data); 'stamp' = both halves 304
// (bump freshness only); 'save' = persist the fresh half(s), a 304 half omitted (the
// stored row already holds it).
export type SkillsPersistPlan =
  | { kind: 'save'; halves: SkillsSaveHalves }
  | { kind: 'stamp' }
  | { kind: 'skip' };

export function planSkillsPersist(
  queueRead: SkillsEsiRead,
  skillsRead: SkillsEsiRead,
): SkillsPersistPlan {
  if (queueRead.kind === 'error' || skillsRead.kind === 'error') return { kind: 'skip' };

  const halves: SkillsSaveHalves = {};
  if (queueRead.kind === 'fresh') {
    const entries = parseSkillQueueBody(queueRead.body);
    if (entries === null) return { kind: 'skip' }; // contract mismatch — keep stored data
    halves.queue = { entries, etag: queueRead.etag };
  }
  if (skillsRead.kind === 'fresh') {
    const totals = parseSkillsBody(skillsRead.body);
    if (totals === null) return { kind: 'skip' };
    halves.skills = { totalSp: totals.totalSp, etag: skillsRead.etag };
    if (totals.unallocatedSp !== undefined) halves.skills.unallocatedSp = totals.unallocatedSp;
  }

  if (halves.queue === undefined && halves.skills === undefined) return { kind: 'stamp' };
  return { kind: 'save', halves };
}

// The save payload the engine carries from fetchAndPlan to save (the fresh half(s)).
interface SkillsSave {
  halves: SkillsSaveHalves;
}

function makeDescriptor(port: SkillsPort): OwnerSyncDescriptor<number, CharacterSkillSyncState, SkillsSave> {
  return {
    now: () => port.now(),
    // Skills has no corp axis, so corporationId is unused — map it in as null.
    enumerate: async (userId) =>
      (await port.listCharacters(userId)).map((character) => ({ ...character, corporationId: null })),
    vendToken: (characterId) => port.vendToken(characterId),
    isStale: (state, now) => isSkillsStale(state?.lastRefreshedAt ?? null, now),
    characterAxis: {
      eligible: (owner) => canSyncSkillQueue(owner),
      ownerOf: (characterId) => characterId,
    },
    readState: (characterId) => port.readSyncState(characterId),
    fetchAndPlan: async (characterId, accessToken, state) => {
      // Both endpoints in parallel, each replaying ITS OWN held etag.
      const [queueRead, skillsRead] = await Promise.all([
        port.readSkillQueue(characterId, accessToken, state?.queueEtag ?? null),
        port.readSkills(characterId, accessToken, state?.skillsEtag ?? null),
      ]);
      return planSkillsPersist(queueRead, skillsRead);
    },
    save: (characterId, payload) => port.saveSkills(characterId, payload.halves),
    stampFresh: (characterId) => port.stampFresh(characterId),
  };
}

export async function refreshSkillsForUser(port: SkillsPort, userId: string): Promise<void> {
  await runOwnerSync(makeDescriptor(port), userId);
}

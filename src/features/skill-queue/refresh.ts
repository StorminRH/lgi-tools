// The on-view skill-queue refresh (MIGRATE.B.1) — the stale-gated write-behind that
// moves skills off the live Convex engine onto the owned-blueprints Neon template.
// PURE orchestration over an injected port (types.ts): it imports no auth and no DB,
// so it stays inside the feature boundary and is unit-tested with a fake port. The
// real port is wired in src/db/skills-sync.ts.
//
// The staleness gate is checked BEFORE any token vend or ESI call, so a fresh
// character does zero work — no vend, no fetch. That single property is what makes a
// re-view inside the 120s window cost nothing. Skills is per-character only, so every
// character is independent: one parallel pass, no character→corp serialisation.
import { parseSkillQueueBody, parseSkillsBody } from './esi-projection';
import { isSkillsStale } from './staleness';
import { canSyncSkillQueue } from './sync-eligibility';
import type { SkillsEsiRead, SkillsPort, SkillsSaveHalves } from './types';

// What a refresh should persist from the two endpoint reads. PURE + tested, so the
// merge/304 logic stays out of the I/O orchestration below (which keeps refreshCharacter
// thin). 'skip' = an ESI error or a contract mismatch on a fresh half (keep stored
// data); 'stamp' = both halves 304 (bump freshness only); 'save' = persist the fresh
// half(s), a 304 half omitted (the stored row already holds it).
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

export async function refreshSkillsForUser(port: SkillsPort, userId: string): Promise<void> {
  const characters = await port.listCharacters(userId);
  await Promise.all(
    characters
      .filter((character) => canSyncSkillQueue(character))
      .map((character) => refreshCharacter(port, character.characterId)),
  );
}

// One character, gated by staleness. The token is vended ONLY when the character is
// stale — so a fresh character never vends or hits ESI. Best-effort: a vend miss, an
// ESI error, or a contract mismatch skips this character without touching the stored
// data (the next view retries). Two single-page endpoints (skillqueue + skills), each
// with its own held etag; planSkillsPersist decides save/stamp/skip from the reads.
async function refreshCharacter(port: SkillsPort, characterId: number): Promise<void> {
  const state = await port.readSyncState(characterId);
  if (!isSkillsStale(state?.lastRefreshedAt ?? null, port.now())) return;

  const accessToken = await port.vendToken(characterId);
  if (accessToken === null) return;

  const [queueRead, skillsRead] = await Promise.all([
    port.readSkillQueue(characterId, accessToken, state?.queueEtag ?? null),
    port.readSkills(characterId, accessToken, state?.skillsEtag ?? null),
  ]);

  const plan = planSkillsPersist(queueRead, skillsRead);
  if (plan.kind === 'skip') return;
  if (plan.kind === 'stamp') {
    await port.stampFresh(characterId);
    return;
  }
  await port.saveSkills(characterId, plan.halves);
}

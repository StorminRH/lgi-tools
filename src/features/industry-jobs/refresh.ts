// The on-view personal industry-jobs refresh (MIGRATE.B.2) — the stale-gated
// write-behind that moves personal jobs off the live Convex engine onto the skill-queue
// Neon template. PURE orchestration over an injected port (types.ts): it imports no
// auth and no DB, so it stays inside the feature boundary and is unit-tested with a
// fake port. The real port is wired in src/db/industry-jobs-sync.ts.
//
// The staleness gate is checked BEFORE any token vend or ESI call, so a fresh
// character does zero work — no vend, no fetch. That single property is what makes a
// re-view inside the 300s window cost nothing. Jobs is per-character only, so every
// character is independent: one parallel pass. The refresh reconciles EXISTENCE (new /
// delivered jobs in the next fresh body); a job's "ready" is derived client-side from
// its absolute end_date — there is no scheduled completion flip.
import { parseIndustryJobsBody } from './esi-projection';
import { isJobsStale } from './staleness';
import { canSyncIndustryJobs } from './sync-eligibility';
import type { IndustryJob } from './esi-projection';
import type { JobsEsiRead, JobsPort } from './types';

// What a refresh should persist from the one endpoint read. PURE + tested, so the
// 304/skip logic stays out of the I/O orchestration below. 'skip' = an ESI error or a
// contract mismatch on a fresh body (keep stored data); 'stamp' = a 304 (bump freshness
// only); 'save' = persist the fresh board.
export type JobsPersistPlan =
  | { kind: 'save'; jobs: IndustryJob[]; etag: string | null }
  | { kind: 'stamp' }
  | { kind: 'skip' };

export function planJobsPersist(read: JobsEsiRead): JobsPersistPlan {
  if (read.kind === 'error') return { kind: 'skip' };
  if (read.kind === 'unchanged') return { kind: 'stamp' };
  const jobs = parseIndustryJobsBody(read.body);
  if (jobs === null) return { kind: 'skip' }; // contract mismatch — keep stored data
  return { kind: 'save', jobs, etag: read.etag };
}

export async function refreshJobsForUser(port: JobsPort, userId: string): Promise<void> {
  const characters = await port.listCharacters(userId);
  await Promise.all(
    characters
      .filter((character) => canSyncIndustryJobs(character))
      .map((character) => refreshCharacter(port, character.characterId)),
  );
}

// One character, gated by staleness. The token is vended ONLY when the character is
// stale — so a fresh character never vends or hits ESI. Best-effort: a vend miss, an
// ESI error, or a contract mismatch skips this character without touching the stored
// data (the next view retries). One single-page endpoint with its held etag;
// planJobsPersist decides save/stamp/skip from the read.
async function refreshCharacter(port: JobsPort, characterId: number): Promise<void> {
  const state = await port.readSyncState(characterId);
  if (!isJobsStale(state?.lastRefreshedAt ?? null, port.now())) return;

  const accessToken = await port.vendToken(characterId);
  if (accessToken === null) return;

  const read = await port.readJobs(characterId, accessToken, state?.jobsEtag ?? null);

  const plan = planJobsPersist(read);
  if (plan.kind === 'skip') return;
  if (plan.kind === 'stamp') {
    await port.stampFresh(characterId);
    return;
  }
  await port.saveJobs(characterId, plan.jobs, plan.etag);
}

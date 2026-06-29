// The on-view corp industry-jobs refresh (MIGRATE.B.3) — the stale-gated write-behind
// that moves corp jobs off the live Convex engine onto the personal-jobs Neon template
// (refresh.ts), with the owned-blueprints/assets corp-director resolution bolted on.
// PURE orchestration over an injected port (types.ts): it imports no auth and no DB, so
// it stays inside the feature boundary and is unit-tested with a fake port. The real
// port is wired in src/db/corp-industry-jobs-sync.ts.
//
// The staleness gate is checked BEFORE any token vend, roles read, or ESI call, so a
// fresh (user, corp) does zero work — that single property is what makes a re-view
// inside the 300s window cost nothing. Corps are independent (a character belongs to
// one corp, so no member's token is vended by two corps at once), so they refresh in
// parallel. The refresh reconciles EXISTENCE (new / delivered jobs in the next fresh
// body); a job's "ready" is derived client-side from its absolute end_date — there is
// no scheduled completion flip.
import {
  type CorpDirectorResolution,
  type CorpMemberCandidate,
  resolveCorpDirector,
} from './corp-director-resolution';
import { CORP_INDUSTRY_JOBS_REQUIRED_ROLES, canSyncCorpIndustryJobs } from './corp-sync-eligibility';
import { parseIndustryJobsBody } from './esi-projection';
import { isJobsStale } from './staleness';
import type { IndustryJob } from './esi-projection';
import type { CorpJobsPort, JobsEsiRead, RefreshCorpMember } from './types';

// What a corp refresh should persist from the one endpoint read. PURE + tested, so the
// 304/error logic stays out of the I/O orchestration. 'skip' = a transient error or a
// contract mismatch (keep the stored board, don't stamp → retry next view); 'stamp' =
// a 304 (bump freshness + clear error); 'needs_role' = a 403 (role revoked mid-run →
// the graceful state); 'save' = persist the fresh board.
export type CorpJobsPersistPlan =
  | { kind: 'save'; jobs: IndustryJob[]; etag: string | null }
  | { kind: 'stamp' }
  | { kind: 'needs_role' }
  | { kind: 'skip' };

export function planCorpJobsPersist(read: JobsEsiRead): CorpJobsPersistPlan {
  if (read.kind === 'error') {
    // A 403 means the in-game role check failed server-side (role revoked since
    // resolution) — the same graceful needs_role state, not a transient retry. Every
    // other error keeps the stored board and retries on the next view (no stamp).
    return read.code === 'esi_403' ? { kind: 'needs_role' } : { kind: 'skip' };
  }
  if (read.kind === 'unchanged') return { kind: 'stamp' };
  const jobs = parseIndustryJobsBody(read.body);
  if (jobs === null) return { kind: 'skip' }; // contract mismatch — keep stored board
  return { kind: 'save', jobs, etag: read.etag };
}

export async function refreshCorpJobsForUser(port: CorpJobsPort, userId: string): Promise<void> {
  const members = await port.listMembers(userId);
  // Group the user's corp-eligible characters by their cached corp, sync each corp
  // ONCE. A character missing the corp scopes is the AccessGate/reconnect path (handled
  // app-side); a character with no cached corp id is skipped until its affiliation is
  // refreshed.
  const byCorp = new Map<number, RefreshCorpMember[]>();
  for (const member of members) {
    if (!canSyncCorpIndustryJobs(member) || member.corporationId === null) continue;
    const group = byCorp.get(member.corporationId) ?? [];
    group.push(member);
    byCorp.set(member.corporationId, group);
  }

  await Promise.all(
    [...byCorp].map(([corporationId, group]) => refreshCorp(port, userId, corporationId, group)),
  );
}

// One corp, gated by staleness. Tokens/roles are read ONLY when the corp is stale — so
// a fresh corp never vends or hits ESI. Best-effort: a transient resolution miss or an
// ESI error skips this corp without touching the stored board (the next view retries).
async function refreshCorp(
  port: CorpJobsPort,
  userId: string,
  corporationId: number,
  members: RefreshCorpMember[],
): Promise<void> {
  const state = await port.readSyncState(userId, corporationId);
  if (!isJobsStale(state?.lastRefreshedAt ?? null, port.now())) return;

  const resolution = await resolveCorpDirectorToken(port, corporationId, members);
  if (resolution.kind === 'unavailable') return; // transient — no stamp, retry next view
  if (resolution.kind === 'needs_role') {
    await port.saveNeedsRole(userId, corporationId);
    return;
  }

  const read = await port.readJobs(corporationId, resolution.accessToken, state?.jobsEtag ?? null);
  const plan = planCorpJobsPersist(read);
  switch (plan.kind) {
    case 'skip':
      return;
    case 'stamp':
      await port.stampFresh(userId, corporationId);
      return;
    case 'needs_role':
      await port.saveNeedsRole(userId, corporationId);
      return;
    case 'save':
      await port.saveJobs(userId, corporationId, plan.jobs, plan.etag);
      return;
  }
}

// Vend each member's token and read its in-game corp roles (in parallel — distinct
// characters), build candidates, then pick + classify (resolveCorpDirector). A member
// that can't be vended or whose roles can't be read contributes no candidate; no
// candidates at all → 'unavailable' (transient), candidates but no role-holder →
// 'needs_role', a role-holder → its token.
async function resolveCorpDirectorToken(
  port: CorpJobsPort,
  _corporationId: number,
  members: RefreshCorpMember[],
): Promise<CorpDirectorResolution> {
  const resolved = await Promise.all(
    members.map(async (member): Promise<CorpMemberCandidate | null> => {
      const accessToken = await port.vendToken(member.characterId);
      if (accessToken === null) return null;
      const roles = await port.readRoles(member.characterId, accessToken);
      if (roles === null) return null;
      const hasRole = CORP_INDUSTRY_JOBS_REQUIRED_ROLES.some((role) => roles.includes(role));
      return { vendingCharacterId: member.characterId, accessToken, hasRole };
    }),
  );
  const candidates = resolved.filter((candidate): candidate is CorpMemberCandidate => candidate !== null);
  return resolveCorpDirector(candidates);
}

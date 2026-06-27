// The 3.7.3.1 corp industry-jobs sync action — runs on the DEFAULT Convex
// runtime (the shared ESI gate is runtime-portable). One run refreshes every
// corp the user can read, deduped by corp:
//
//   heldState (per-corp etag) → eve-characters (Neon enumeration — the ownership
//   boundary) → resolveCorpSubjects (per character: vend token, read public corp
//   id + corp roles → group/dedup by corp, pick a role-holding vending char) →
//   per role-holding corp: ONE corp-jobs read through the shared gate →
//   ONE applySyncResults mutation.
//
// The orchestrator stays thin: enumeration, token vend, corp resolution + dedup,
// and the corp-keyed apply skeleton are the shared corp machinery
// (convex/lib/corpSync.ts) and the character leaves (convex/lib/characterSync.ts).
// Throw = "transient, let the Action Retrier retry"; a budget refusal stops the
// run and is recorded; a corp without the in-game role is a recorded 'needs_role'
// state (no ESI call spent), and a corp-jobs 403 (role revoked mid-run) maps to
// the same graceful state — never a scope/AccessGate prompt.
import { v } from 'convex/values';
import {
  canSyncCorpIndustryJobs,
  CORP_INDUSTRY_JOBS_REQUIRED_ROLES,
} from '@/features/industry-jobs/corp-sync-eligibility';
import { parseIndustryJobsBody, type IndustryJob } from '@/features/industry-jobs/esi-projection';
import { EsiBudgetExhaustedError } from '@/lib/esi';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { fetchEnumeratedCharacters, requireSyncEnv, resolveExpiresAt } from './lib/characterSync';
import { type CorpSubject, resolveCorpSubjects } from './lib/corpSync';
import { readEsi, type RlSnapshot } from './lib/esiRead';

// Fallback freshness window when a response carries no parseable Expires header.
// Matches the corp industry-jobs cache (300s) but is a last resort — the header
// is the truth and is preferred whenever present.
const FALLBACK_TTL_MS = 300_000;

interface CorpResult {
  corporationId: number;
  jobs: IndustryJob[] | null;
  jobsEtag: string | null;
  expiresAt: number | null;
  error: string | null;
}

type CorpOutcome =
  | { kind: 'result'; result: CorpResult }
  | { kind: 'stop'; runError: string; result: CorpResult };

export const syncUser = internalAction({
  args: { userId: v.string(), generation: v.number() },
  handler: async (ctx, { userId, generation }) => {
    const env = requireSyncEnv();

    const held = await ctx.runQuery(internal.corpIndustryJobs.heldState, { userId });
    const heldByCorp = new Map(held.map((h) => [h.corporationId, h.jobsEtag]));
    const characters = await fetchEnumeratedCharacters(env, userId);

    const rl: RlSnapshot = { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };
    const resolution = await resolveCorpSubjects(env, characters, {
      canSync: canSyncCorpIndustryJobs,
      requiredRoles: CORP_INDUSTRY_JOBS_REQUIRED_ROLES,
      rl,
    });

    // Orphan cleanup is only safe when the FULL corp set is known — i.e.
    // resolution finished (no budget cut). A later read-loop stop does not
    // un-know the set, so this is captured before the loop.
    const complete = resolution.runError === null;

    const results: CorpResult[] = [];
    let runError = resolution.runError;
    if (complete) {
      for (const corp of resolution.corps) {
        const outcome = await syncCorpJobs(corp, heldByCorp.get(corp.corporationId) ?? null, rl);
        results.push(outcome.result);
        if (outcome.kind === 'stop') {
          runError = outcome.runError;
          break;
        }
      }
    }

    await ctx.runMutation(internal.corpIndustryJobs.applySyncResults, {
      userId,
      generation,
      enumeratedCharacterIds: resolution.enumeratedCharacterIds,
      complete,
      resolvedCorpIds: resolution.corps.map((c) => c.corporationId),
      results,
      lastError: runError,
      ...rl,
    });
  },
});

// One corp: a role-less corp short-circuits to 'needs_role' WITHOUT an ESI call
// (the role read in resolution already told us a 403 is guaranteed — don't waste
// error budget). Otherwise ONE conditional corp-jobs read + boundary parse. A
// corp-jobs 403 (role revoked since resolution) also maps to 'needs_role'; a
// fresh body that fails the parse is a contract error; a budget refusal stops the
// whole run.
async function syncCorpJobs(
  corp: CorpSubject,
  heldEtag: string | null,
  rl: RlSnapshot,
): Promise<CorpOutcome> {
  if (!corp.hasRole) {
    return { kind: 'result', result: corpErrorResult(corp.corporationId, 'needs_role', heldEtag) };
  }

  try {
    const read = await readEsi(
      `/corporations/${corp.corporationId}/industry/jobs`,
      corp.accessToken,
      heldEtag,
      rl,
    );
    if (read.kind === 'error') {
      // A 403 means the in-game role check failed server-side (role revoked since
      // resolution) — the same graceful state, not a hard error.
      const code = read.code === 'esi_403' ? 'needs_role' : read.code;
      return { kind: 'result', result: corpErrorResult(corp.corporationId, code, heldEtag) };
    }

    let jobs: IndustryJob[] | null = null;
    let jobsEtag = heldEtag;
    if (read.kind === 'fresh') {
      jobs = parseIndustryJobsBody(read.body);
      if (jobs === null) {
        return { kind: 'result', result: corpErrorResult(corp.corporationId, 'contract_error', heldEtag) };
      }
      jobsEtag = read.etag;
    }

    return {
      kind: 'result',
      result: {
        corporationId: corp.corporationId,
        jobs,
        jobsEtag,
        expiresAt: resolveExpiresAt([read.expiresAt], FALLBACK_TTL_MS, Date.now()),
        error: null,
      },
    };
  } catch (error) {
    if (error instanceof EsiBudgetExhaustedError) {
      return {
        kind: 'stop',
        runError: `budget_exhausted:${error.reason}`,
        result: corpErrorResult(corp.corporationId, 'budget_exhausted', heldEtag),
      };
    }
    throw error;
  }
}

function corpErrorResult(corporationId: number, code: string, heldEtag: string | null): CorpResult {
  return {
    corporationId,
    jobs: null,
    // Echo the held etag — an errored read must not discard custody.
    jobsEtag: heldEtag,
    expiresAt: null,
    error: code,
  };
}

// The 3.7.5.1 corp owned-blueprints sync action — runs on the DEFAULT Convex
// runtime (the shared ESI gate is runtime-portable). One run refreshes every
// corp the user can read, deduped by corp:
//
//   heldState (per-corp per-page etags) → eve-characters (Neon enumeration — the
//   ownership boundary) → resolveCorpSubjects (per character: vend token, read
//   public corp id + corp roles → group/dedup by corp, pick a role-holding
//   vending char) → per role-holding corp: ONE paginated blueprints read through
//   the shared gate → ONE applySyncResults mutation.
//
// The orchestrator stays thin: enumeration, token vend, corp resolution + dedup,
// and the corp-keyed apply skeleton are the shared corp machinery
// (convex/lib/corpSync.ts); pagination + the conditional read are the shared gate
// reader (convex/lib/esiRead.ts). Throw = "transient, let the Action Retrier
// retry"; a budget refusal stops the run and is recorded; a corp whose vending
// character lacks the in-game Director role is a recorded 'needs_role' state (no
// ESI call spent), and a blueprints 403 (role revoked mid-run) maps to the same
// graceful state — never a scope/AccessGate prompt.
import { v } from 'convex/values';
import {
  CORP_BLUEPRINTS_REQUIRED_ROLES,
  canSyncCorpBlueprints,
} from '@/features/owned-blueprints/corp-sync-eligibility';
import { parseBlueprintsBody, type OwnedBlueprint } from '@/features/owned-blueprints/esi-projection';
import { EsiBudgetExhaustedError } from '@/lib/esi';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { fetchEnumeratedCharacters, requireSyncEnv, resolveExpiresAt } from './lib/characterSync';
import { type CorpSubject, resolveCorpSubjects } from './lib/corpSync';
import { readEsiPaged, type RlSnapshot } from './lib/esiRead';

// Fallback freshness window when a response carries no parseable Expires header.
// Matches the blueprints cache (3600s) but is a last resort — the header is the
// truth and is preferred whenever present.
const FALLBACK_TTL_MS = 3_600_000;

interface CorpResult {
  corporationId: number;
  blueprints: OwnedBlueprint[] | null;
  etags: string[];
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

    const held = await ctx.runQuery(internal.corpBlueprints.heldState, { userId });
    const heldByCorp = new Map(held.map((h) => [h.corporationId, h.etags]));
    const characters = await fetchEnumeratedCharacters(env, userId);

    const rl: RlSnapshot = { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };
    const resolution = await resolveCorpSubjects(env, characters, {
      canSync: canSyncCorpBlueprints,
      requiredRoles: CORP_BLUEPRINTS_REQUIRED_ROLES,
      rl,
    });

    // Orphan cleanup is only safe when the FULL corp set is known — i.e.
    // resolution finished (no budget cut). Captured before the read loop, since a
    // later read-loop stop does not un-know the set.
    const complete = resolution.runError === null;

    const results: CorpResult[] = [];
    let runError = resolution.runError;
    if (complete) {
      for (const corp of resolution.corps) {
        const outcome = await syncCorpBlueprints(corp, heldByCorp.get(corp.corporationId) ?? [], rl);
        results.push(outcome.result);
        if (outcome.kind === 'stop') {
          runError = outcome.runError;
          break;
        }
      }
    }

    await ctx.runMutation(internal.corpBlueprints.applySyncResults, {
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
// (resolution's role read already told us a 403 is guaranteed). Otherwise ONE
// paginated conditional read + boundary parse. A blueprints 403 (role revoked
// since resolution) also maps to 'needs_role'; a fresh body that fails the parse
// is a contract error; a budget refusal stops the whole run.
async function syncCorpBlueprints(
  corp: CorpSubject,
  heldEtags: string[],
  rl: RlSnapshot,
): Promise<CorpOutcome> {
  if (!corp.hasRole) {
    return {
      kind: 'result',
      result: corpErrorResult(corp.corporationId, 'needs_role', heldEtags),
    };
  }

  try {
    const read = await readEsiPaged(
      `/corporations/${corp.corporationId}/blueprints/`,
      corp.accessToken,
      heldEtags,
      rl,
    );
    if (read.kind === 'error') {
      const code = read.code === 'esi_403' ? 'needs_role' : read.code;
      return { kind: 'result', result: corpErrorResult(corp.corporationId, code, heldEtags) };
    }
    if (read.kind === 'unchanged') {
      return {
        kind: 'result',
        result: {
          corporationId: corp.corporationId,
          blueprints: null,
          etags: heldEtags,
          expiresAt: resolveExpiresAt([read.expiresAt], FALLBACK_TTL_MS, Date.now()),
          error: null,
        },
      };
    }

    const blueprints = parseBlueprintsBody(read.items);
    if (blueprints === null) {
      return {
        kind: 'result',
        result: corpErrorResult(corp.corporationId, 'contract_error', heldEtags),
      };
    }
    return {
      kind: 'result',
      result: {
        corporationId: corp.corporationId,
        blueprints,
        etags: read.etags,
        expiresAt: resolveExpiresAt([read.expiresAt], FALLBACK_TTL_MS, Date.now()),
        error: null,
      },
    };
  } catch (error) {
    if (error instanceof EsiBudgetExhaustedError) {
      return {
        kind: 'stop',
        runError: `budget_exhausted:${error.reason}`,
        result: corpErrorResult(corp.corporationId, 'budget_exhausted', heldEtags),
      };
    }
    throw error;
  }
}

function corpErrorResult(corporationId: number, code: string, heldEtags: string[]): CorpResult {
  return {
    corporationId,
    blueprints: null,
    // Echo the held etags — an errored read must not discard custody.
    etags: heldEtags,
    expiresAt: null,
    error: code,
  };
}

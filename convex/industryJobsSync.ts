// The 3.4.8 industry-jobs sync action — runs on the DEFAULT Convex runtime
// (no "use node"; the shared ESI gate is runtime-portable per Decision
// Record 11, proven live by the 3.4.7 skills sync). One run refreshes every
// linked character for one user:
//
//   heldState (etag) → eve-characters (Neon enumeration — the ownership
//   boundary) → per character: eve-token vend + ONE industry-jobs read
//   through the shared gate → ONE applySyncResults mutation.
//
// The orchestrator stays thin: the env guard, character enumeration, and token
// vend are shared leaves (convex/lib/characterSync.ts); the per-character read,
// parse, and budget-stop taxonomy are the named helpers below. Throw = "transient,
// let the Action Retrier retry" (network, ESI 5xx, Neon-side 5xx); everything
// else — token 4xx, ESI 4xx, contract drift, budget refusal — becomes a recorded
// per-character or run-level error so a hopeless run is never retried and partial
// results are never lost.
import { v } from 'convex/values';
import type { EveCharactersResponse } from '@/features/auth/api-contract';
import { parseIndustryJobsBody, type IndustryJob } from '@/features/industry-jobs/esi-projection';
import { canSyncIndustryJobs } from '@/features/industry-jobs/sync-eligibility';
import { EsiBudgetExhaustedError } from '@/lib/esi';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import {
  fetchEnumeratedCharacters,
  requireSyncEnv,
  resolveExpiresAt,
  type SyncEnv,
  vendCharacterToken,
} from './lib/characterSync';
import { readEsi, type RlSnapshot } from './lib/esiRead';

// Fallback freshness window when a response carries no parseable Expires
// header. Matches the spec's industry-jobs cache (x-cache-age 300) but is a
// last resort — the header is the truth and is preferred whenever present.
const FALLBACK_TTL_MS = 300_000;

type SyncCharacter = EveCharactersResponse['characters'][number];

interface CharacterResult {
  characterId: number;
  jobs: IndustryJob[] | null;
  jobsEtag: string | null;
  expiresAt: number | null;
  error: string | null;
}

// What one character's processing resolves to, lifted out of the loop so the
// per-character control flow uses returns instead of continue/break.
type CharacterOutcome =
  | { kind: 'skip' }
  | { kind: 'result'; result: CharacterResult }
  | { kind: 'stop'; runError: string; result: CharacterResult };

export const syncUser = internalAction({
  args: { userId: v.string(), generation: v.number() },
  handler: async (ctx, { userId, generation }) => {
    const env = requireSyncEnv();

    const held = await ctx.runQuery(internal.industryJobs.heldState, { userId });
    const heldByCharacter = new Map(held.map((h) => [h.characterId, h.jobsEtag]));
    const characters = await fetchEnumeratedCharacters(env, userId);

    const results: CharacterResult[] = [];
    const rl: RlSnapshot = { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };
    let runError: string | null = null;

    // Sequential by design — gentle on the shared per-group token bucket
    // (the spec puts industry jobs in `char-industry`, 600/15m; the observed
    // group lands on the state doc each run — read, never assumed).
    for (const character of characters) {
      const heldEtag = heldByCharacter.get(character.characterId) ?? null;
      const outcome = await syncJobsCharacter(env, character, heldEtag, rl);
      if (outcome.kind === 'skip') continue;
      results.push(outcome.result);
      if (outcome.kind === 'stop') {
        runError = outcome.runError;
        break;
      }
    }

    await ctx.runMutation(internal.industryJobs.applySyncResults, {
      userId,
      generation,
      enumeratedCharacterIds: characters.map((c) => c.characterId),
      results,
      lastError: runError,
      ...rl,
    });
  },
});

// One character: eligibility → token vend → read + build, with the budget-stop
// taxonomy. EsiBudgetExhaustedError stops the whole run (a retry would refuse
// too); any other throw is genuinely transient and rethrown for the retrier.
async function syncJobsCharacter(
  env: SyncEnv,
  character: SyncCharacter,
  heldEtag: string | null,
  rl: RlSnapshot,
): Promise<CharacterOutcome> {
  const characterId = character.characterId;
  if (!canSyncIndustryJobs(character)) {
    return { kind: 'result', result: errorResult(characterId, 'reauth_required', heldEtag) };
  }

  const vend = await vendCharacterToken(env, characterId);
  if (vend.kind === 'skip') return { kind: 'skip' };
  if (vend.kind === 'reauth') {
    return { kind: 'result', result: errorResult(characterId, 'reauth_required', heldEtag) };
  }
  if (vend.kind === 'unavailable') {
    return { kind: 'result', result: errorResult(characterId, 'token_unavailable', heldEtag) };
  }

  try {
    return { kind: 'result', result: await readJobsCharacter(characterId, vend.accessToken, heldEtag, rl) };
  } catch (error) {
    if (error instanceof EsiBudgetExhaustedError) {
      return {
        kind: 'stop',
        runError: `budget_exhausted:${error.reason}`,
        result: errorResult(characterId, 'budget_exhausted', heldEtag),
      };
    }
    throw error;
  }
}

// The one conditional read + boundary parse → one CharacterResult. A 304 keeps
// the held etag and leaves jobs null; a fresh body that fails the parse is a
// contract error for the character (not a retry — a shape change won't fix
// itself).
async function readJobsCharacter(
  characterId: number,
  accessToken: string,
  heldEtag: string | null,
  rl: RlSnapshot,
): Promise<CharacterResult> {
  const read = await readEsi(`/characters/${characterId}/industry/jobs`, accessToken, heldEtag, rl);
  if (read.kind === 'error') return errorResult(characterId, read.code, heldEtag);

  let jobs: IndustryJob[] | null = null;
  let jobsEtag = heldEtag;
  if (read.kind === 'fresh') {
    jobs = parseIndustryJobsBody(read.body);
    if (jobs === null) return errorResult(characterId, 'contract_error', heldEtag);
    jobsEtag = read.etag;
  }

  return {
    characterId,
    jobs,
    jobsEtag,
    expiresAt: resolveExpiresAt([read.expiresAt], FALLBACK_TTL_MS, Date.now()),
    error: null,
  };
}

function errorResult(characterId: number, code: string, heldEtag: string | null): CharacterResult {
  return {
    characterId,
    jobs: null,
    // Echo the held etag — ESI's 304 never repeats an ETag, and an errored
    // read must not discard custody either.
    jobsEtag: heldEtag,
    expiresAt: null,
    error: code,
  };
}

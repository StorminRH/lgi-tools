// The 3.7.5.1 owned-blueprints sync action (character variant) — runs on the
// DEFAULT Convex runtime (the shared ESI gate is runtime-portable). One run
// refreshes every linked character for one user:
//
//   heldState (per-page etags) → eve-characters (Neon enumeration — the
//   ownership boundary) → per character: eve-token vend + paginated blueprints
//   read through the shared gate → ONE applySyncResults mutation.
//
// The orchestrator stays thin: the env guard, character enumeration, and token
// vend are shared leaves (convex/lib/characterSync.ts); pagination + the
// conditional read live in the shared gate reader (convex/lib/esiRead.ts). Throw
// = "transient, let the Action Retrier retry"; everything else — token 4xx, ESI
// 4xx, contract drift, budget refusal — becomes a recorded per-character or
// run-level error so a hopeless run is never retried and partial results survive.
import { v } from 'convex/values';
import type { EveCharactersResponse } from '@/features/auth/api-contract';
import { parseBlueprintsBody, type OwnedBlueprint } from '@/features/owned-blueprints/esi-projection';
import { canSyncBlueprints } from '@/features/owned-blueprints/sync-eligibility';
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
import { readEsiPaged, type RlSnapshot } from './lib/esiRead';

// Fallback freshness window when a response carries no parseable Expires header.
// Matches the blueprints cache (3600s) but is a last resort — the header is the
// truth and is preferred whenever present.
const FALLBACK_TTL_MS = 3_600_000;

type SyncCharacter = EveCharactersResponse['characters'][number];

interface CharacterResult {
  characterId: number;
  blueprints: OwnedBlueprint[] | null;
  etags: string[];
  expiresAt: number | null;
  error: string | null;
}

type CharacterOutcome =
  | { kind: 'skip' }
  | { kind: 'result'; result: CharacterResult }
  | { kind: 'stop'; runError: string; result: CharacterResult };

export const syncUser = internalAction({
  args: { userId: v.string(), generation: v.number() },
  handler: async (ctx, { userId, generation }) => {
    const env = requireSyncEnv();

    const held = await ctx.runQuery(internal.characterBlueprints.heldState, { userId });
    const heldByCharacter = new Map(held.map((h) => [h.characterId, h.etags]));
    const characters = await fetchEnumeratedCharacters(env, userId);

    const results: CharacterResult[] = [];
    const rl: RlSnapshot = { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };
    let runError: string | null = null;

    // Sequential by design — gentle on the shared `char-blueprints` token bucket.
    for (const character of characters) {
      const etags = heldByCharacter.get(character.characterId) ?? [];
      const outcome = await syncBlueprintsCharacter(env, character, etags, rl);
      if (outcome.kind === 'skip') continue;
      results.push(outcome.result);
      if (outcome.kind === 'stop') {
        runError = outcome.runError;
        break;
      }
    }

    await ctx.runMutation(internal.characterBlueprints.applySyncResults, {
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
// taxonomy. EsiBudgetExhaustedError stops the whole run; any other throw is
// genuinely transient and rethrown for the retrier.
async function syncBlueprintsCharacter(
  env: SyncEnv,
  character: SyncCharacter,
  etags: string[],
  rl: RlSnapshot,
): Promise<CharacterOutcome> {
  const characterId = character.characterId;
  if (!canSyncBlueprints(character)) {
    return { kind: 'result', result: errorResult(characterId, 'reauth_required', etags) };
  }

  const vend = await vendCharacterToken(env, characterId);
  if (vend.kind === 'skip') return { kind: 'skip' };
  if (vend.kind === 'reauth') {
    return { kind: 'result', result: errorResult(characterId, 'reauth_required', etags) };
  }
  if (vend.kind === 'unavailable') {
    return { kind: 'result', result: errorResult(characterId, 'token_unavailable', etags) };
  }

  try {
    return {
      kind: 'result',
      result: await readBlueprintsCharacter(characterId, vend.accessToken, etags, rl),
    };
  } catch (error) {
    if (error instanceof EsiBudgetExhaustedError) {
      return {
        kind: 'stop',
        runError: `budget_exhausted:${error.reason}`,
        result: errorResult(characterId, 'budget_exhausted', etags),
      };
    }
    throw error;
  }
}

// The paginated conditional read + boundary parse → one CharacterResult. A 304
// keeps the held etags and leaves blueprints null; a fresh body that fails the
// parse is a contract error.
async function readBlueprintsCharacter(
  characterId: number,
  accessToken: string,
  etags: string[],
  rl: RlSnapshot,
): Promise<CharacterResult> {
  const read = await readEsiPaged(`/characters/${characterId}/blueprints/`, accessToken, etags, rl);
  if (read.kind === 'error') return errorResult(characterId, read.code, etags);
  if (read.kind === 'unchanged') {
    return {
      characterId,
      blueprints: null,
      etags,
      expiresAt: resolveExpiresAt([read.expiresAt], FALLBACK_TTL_MS, Date.now()),
      error: null,
    };
  }

  const blueprints = parseBlueprintsBody(read.items);
  if (blueprints === null) return errorResult(characterId, 'contract_error', etags);
  return {
    characterId,
    blueprints,
    etags: read.etags,
    expiresAt: resolveExpiresAt([read.expiresAt], FALLBACK_TTL_MS, Date.now()),
    error: null,
  };
}

function errorResult(characterId: number, code: string, etags: string[]): CharacterResult {
  return {
    characterId,
    blueprints: null,
    // Echo the held etags — ESI's 304 never repeats an ETag, and an errored read
    // must not discard custody either.
    etags,
    expiresAt: null,
    error: code,
  };
}

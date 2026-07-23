// The MIGRATE.A online-status sync action — runs on the DEFAULT Convex runtime
// (no "use node"; the shared ESI gate is runtime-portable). One run refreshes
// every linked character's online state for one user:
//
//   heldState (etags) → eve-characters (Neon enumeration — the ownership
//   boundary) → per character: eligibility gate + eve-token vend + the single
//   /online read through the shared gate → ONE applySyncResults mutation.
//
// The single-read twin of skillsSync (skills does two reads + a merge; online is
// one read, so there is no half-fresh state and no two-etag bookkeeping). Throw =
// "transient, let the Action Retrier retry" (network, ESI 5xx, Neon-side 5xx);
// everything else — token 4xx, ESI 4xx, contract drift, budget refusal — becomes
// a recorded per-character or run-level error so a hopeless run is never retried
// and partial results are never lost.
import { v } from 'convex/values';
import type { EveCharactersResponse } from '@/platform/auth/api-contract';
import { parseOnlineBody } from '@/features/online-status/esi-projection';
import { canSyncOnline } from '@/features/online-status/sync-eligibility';
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
import { readEsiAuthed, type RlSnapshot } from '@/lib/esi/authed-read';

// Fallback freshness window when a response carries no parseable Expires header.
// Matches the live-observed online cache (~60s) but is a last resort — the header
// is the truth and is preferred whenever present.
const FALLBACK_TTL_MS = 60_000;

type SyncCharacter = EveCharactersResponse['characters'][number];

interface CharacterResult {
  characterId: number;
  online: boolean | null;
  etag: string | null;
  expiresAt: number | null;
  error: string | null;
}

// What one character's processing resolves to, lifted out of the loop so the
// per-character control flow uses returns instead of continue/break.
type CharacterOutcome =
  | { kind: 'skip' }
  | { kind: 'result'; result: CharacterResult }
  | { kind: 'stop'; runError: string; result: CharacterResult };

/**
 * Runs the authenticated online-status sync for one user through the shared Convex engine; the
 * engine owns scheduling and persisted run state.
 */
export const syncUser = internalAction({
  args: { userId: v.string(), generation: v.number() },
  handler: async (ctx, { userId, generation }) => {
    const env = requireSyncEnv();

    const held = await ctx.runQuery(internal.onlineStatus.heldState, { userId });
    const heldByCharacter = new Map(held.map((h) => [h.characterId, h.etag]));
    const characters = await fetchEnumeratedCharacters(env, userId);

    const results: CharacterResult[] = [];
    const rl: RlSnapshot = { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };
    let runError: string | null = null;

    // Sequential by design — gentle on the shared `char-online` token bucket.
    for (const character of characters) {
      const heldEtag = heldByCharacter.get(character.characterId) ?? null;
      const outcome = await syncOnlineCharacter(env, userId, character, heldEtag, rl);
      if (outcome.kind === 'skip') continue;
      results.push(outcome.result);
      if (outcome.kind === 'stop') {
        runError = outcome.runError;
        break;
      }
    }

    await ctx.runMutation(internal.onlineStatus.applySyncResults, {
      userId,
      generation,
      enumeratedCharacterIds: characters.map((c) => c.characterId),
      results,
      lastError: runError,
      ...rl,
    });
  },
});

// One character: eligibility → token vend → read, with the budget-stop taxonomy.
// EsiBudgetExhaustedError stops the whole run (a retry would refuse too); any other
// throw is genuinely transient and rethrown for the retrier.
async function syncOnlineCharacter(
  env: SyncEnv,
  userId: string,
  character: SyncCharacter,
  heldEtag: string | null,
  rl: RlSnapshot,
): Promise<CharacterOutcome> {
  const characterId = character.characterId;
  // A character that hasn't granted the online scope (e.g. not yet relinked after
  // MIGRATE.A re-admitted it) is recorded reauth_required and never fetched — its
  // portrait simply shows no dot, no error chrome.
  if (!canSyncOnline(character)) {
    return { kind: 'result', result: errorResult(characterId, 'reauth_required', heldEtag) };
  }

  const vend = await vendCharacterToken(env, userId, characterId);
  if (vend.kind === 'skip') return { kind: 'skip' };
  if (vend.kind === 'reauth') {
    return { kind: 'result', result: errorResult(characterId, 'reauth_required', heldEtag) };
  }
  if (vend.kind === 'unavailable') {
    return { kind: 'result', result: errorResult(characterId, 'token_unavailable', heldEtag) };
  }

  try {
    return { kind: 'result', result: await readOnlineCharacter(characterId, vend.accessToken, heldEtag, rl) };
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

// One conditional read + boundary parse → one CharacterResult. A 304 keeps the
// held etag and leaves `online` null (the apply keeps the stored value); a fresh
// body that fails the parse is a contract error.
async function readOnlineCharacter(
  characterId: number,
  accessToken: string,
  heldEtag: string | null,
  rl: RlSnapshot,
): Promise<CharacterResult> {
  const read = await readEsiAuthed(`/characters/${characterId}/online`, accessToken, heldEtag, rl);
  if (read.kind === 'error') return errorResult(characterId, read.code, heldEtag);

  const expiresAt = resolveExpiresAt([read.expiresAt], FALLBACK_TTL_MS, Date.now());
  if (read.kind === 'unchanged') {
    // 304 — keep the held etag (ESI's 304 never repeats it) and leave online null.
    return { characterId, online: null, etag: heldEtag, expiresAt, error: null };
  }

  // Fresh 200 — a genuine flip; parse and store the new etag.
  const online = parseOnlineBody(read.body);
  if (online === null) return errorResult(characterId, 'contract_error', heldEtag);
  return { characterId, online, etag: read.etag, expiresAt, error: null };
}

function errorResult(characterId: number, code: string, heldEtag: string | null): CharacterResult {
  // Echo the held etag — an errored read must not discard custody (the apply
  // keeps the existing doc untouched on an error anyway).
  return { characterId, online: null, etag: heldEtag, expiresAt: null, error: code };
}

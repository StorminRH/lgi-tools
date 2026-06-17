// The 3.4.7 sync action — runs on the DEFAULT Convex runtime (no "use node";
// the shared ESI gate is runtime-portable per Decision Record 11, proven by
// this very consumer). One run refreshes every linked character for one user:
//
//   heldState (etags) → eve-characters (Neon enumeration — the ownership
//   boundary) → per character: eve-token vend + skillqueue/skills reads
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
import {
  parseSkillQueueBody,
  parseSkillsBody,
  type SkillQueueEntry,
  type SkillTotals,
} from '@/features/skill-queue/esi-projection';
import { canSyncSkillQueue } from '@/features/skill-queue/sync-eligibility';
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
// header. Matches the live-observed skills cache (max-age=60) but is a
// last resort — the header is the truth and is preferred whenever present.
const FALLBACK_TTL_MS = 60_000;

type SyncCharacter = EveCharactersResponse['characters'][number];

interface HeldEtags {
  queueEtag: string | null;
  skillsEtag: string | null;
}

interface CharacterResult {
  characterId: number;
  queueEntries: SkillQueueEntry[] | null;
  skills: SkillTotals | null;
  queueEtag: string | null;
  skillsEtag: string | null;
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

    const held = await ctx.runQuery(internal.skills.heldState, { userId });
    const heldByCharacter = new Map(held.map((h) => [h.characterId, h]));
    const characters = await fetchEnumeratedCharacters(env, userId);

    const results: CharacterResult[] = [];
    const rl: RlSnapshot = { rlGroup: null, rlLimit: null, rlRemaining: null, rlUsed: null };
    let runError: string | null = null;

    // Sequential by design — gentle on the shared `char-detail` token bucket
    // (600/15m across EVERY character endpoint this user's features read).
    for (const character of characters) {
      const etags = heldByCharacter.get(character.characterId) ?? {
        queueEtag: null,
        skillsEtag: null,
      };
      const outcome = await syncSkillsCharacter(env, character, etags, rl);
      if (outcome.kind === 'skip') continue;
      results.push(outcome.result);
      if (outcome.kind === 'stop') {
        runError = outcome.runError;
        break;
      }
    }

    await ctx.runMutation(internal.skills.applySyncResults, {
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
async function syncSkillsCharacter(
  env: SyncEnv,
  character: SyncCharacter,
  etags: HeldEtags,
  rl: RlSnapshot,
): Promise<CharacterOutcome> {
  const characterId = character.characterId;
  if (!canSyncSkillQueue(character)) {
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
    return { kind: 'result', result: await readSkillsCharacter(characterId, vend.accessToken, etags, rl) };
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

// The two conditional reads + boundary parse → one CharacterResult. A read
// error short-circuits (the second read never happens); a 304 keeps the held
// etag and leaves that half null; a fresh body that fails the parse is a
// contract error. The next window ends when the FIRST of the two caches expires.
async function readSkillsCharacter(
  characterId: number,
  accessToken: string,
  etags: HeldEtags,
  rl: RlSnapshot,
): Promise<CharacterResult> {
  const queueRead = await readEsi(
    `/characters/${characterId}/skillqueue`,
    accessToken,
    etags.queueEtag,
    rl,
  );
  if (queueRead.kind === 'error') return errorResult(characterId, queueRead.code, etags);
  const skillsRead = await readEsi(
    `/characters/${characterId}/skills`,
    accessToken,
    etags.skillsEtag,
    rl,
  );
  if (skillsRead.kind === 'error') return errorResult(characterId, skillsRead.code, etags);

  let queueEntries: SkillQueueEntry[] | null = null;
  let queueEtag = etags.queueEtag;
  if (queueRead.kind === 'fresh') {
    queueEntries = parseSkillQueueBody(queueRead.body);
    if (queueEntries === null) return errorResult(characterId, 'contract_error', etags);
    queueEtag = queueRead.etag;
  }

  let skills: SkillTotals | null = null;
  let skillsEtag = etags.skillsEtag;
  if (skillsRead.kind === 'fresh') {
    skills = parseSkillsBody(skillsRead.body);
    if (skills === null) return errorResult(characterId, 'contract_error', etags);
    skillsEtag = skillsRead.etag;
  }

  return {
    characterId,
    queueEntries,
    skills,
    queueEtag,
    skillsEtag,
    expiresAt: resolveExpiresAt(
      [queueRead.expiresAt, skillsRead.expiresAt],
      FALLBACK_TTL_MS,
      Date.now(),
    ),
    error: null,
  };
}

function errorResult(characterId: number, code: string, etags: HeldEtags): CharacterResult {
  return {
    characterId,
    queueEntries: null,
    skills: null,
    // Echo the held etags — ESI's 304 never repeats an ETag, and an errored
    // read must not discard custody either.
    queueEtag: etags.queueEtag,
    skillsEtag: etags.skillsEtag,
    expiresAt: null,
    error: code,
  };
}

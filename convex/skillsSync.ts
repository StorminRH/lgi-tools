// The 3.4.7 sync action — runs on the DEFAULT Convex runtime (no "use node";
// the shared ESI gate is runtime-portable per Decision Record 11, proven by
// this very consumer). One run refreshes every linked character for one user:
//
//   heldState (etags) → eve-characters (Neon enumeration — the ownership
//   boundary) → per character: eve-token vend + skillqueue/skills reads
//   through the shared gate → ONE applySyncResults mutation.
//
// The refresh token never reaches Convex: the vend endpoint returns only a
// short-lived access token. Throw = "transient, let the Action Retrier
// retry" (network, ESI 5xx, Neon-side 5xx); everything else — token 4xx,
// ESI 4xx, contract drift, budget refusal — becomes a recorded per-character
// or run-level error so a hopeless run is never retried and partial results
// are never lost.
import { v } from 'convex/values';
import type { EveCharactersResponse, EveTokenOkResponse } from '@/features/auth/api-contract';
import {
  parseSkillQueueBody,
  parseSkillsBody,
  type SkillQueueEntry,
  type SkillTotals,
} from '@/features/skill-queue/esi-projection';
import { canSyncSkillQueue } from '@/features/skill-queue/sync-eligibility';
import { EsiBudgetExhaustedError, esiFetch, esiUrl } from '@/lib/esi';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';

// Fallback freshness window when a response carries no parseable Expires
// header. Matches the live-observed skills cache (max-age=60) but is a
// last resort — the header is the truth and is preferred whenever present.
const FALLBACK_TTL_MS = 60_000;

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

// Latest X-Ratelimit-* numbers seen this run — the `char-detail` group usage
// the 3.4.9 engine will schedule against. Mutated in place as reads land.
interface RlSnapshot {
  rlGroup: string | null;
  rlLimit: number | null;
  rlRemaining: number | null;
  rlUsed: number | null;
}

export const syncUser = internalAction({
  args: { userId: v.string(), generation: v.number() },
  handler: async (ctx, { userId, generation }) => {
    // Deployment-level config (set via `npx convex env set`) — the app's
    // NEXT_PUBLIC_* inlines don't exist in a Convex bundle.
    const siteUrl = process.env.SITE_URL;
    const secret = process.env.CONVEX_SERVICE_SECRET;
    if (siteUrl === undefined || secret === undefined) {
      throw new Error('SITE_URL and CONVEX_SERVICE_SECRET must be set on this Convex deployment');
    }

    const held = await ctx.runQuery(internal.skills.heldState, { userId });
    const heldByCharacter = new Map(held.map((h) => [h.characterId, h]));

    // fetchWithTimeout (not bare fetch): a hung Next.js endpoint must fail
    // fast into the Action Retrier rather than holding the action open until
    // the platform kills it.
    const charactersRes = await fetchWithTimeout(`${siteUrl}/api/internal/eve-characters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ userId }),
    });
    if (!charactersRes.ok) {
      // Neon-side trouble — transient by assumption; the retrier retries.
      throw new Error(`eve-characters returned ${charactersRes.status}`);
    }
    const { characters } = (await charactersRes.json()) as EveCharactersResponse;

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

      if (!canSyncSkillQueue(character)) {
        results.push(errorResult(character.characterId, 'reauth_required', etags));
        continue;
      }

      const tokenRes = await fetchWithTimeout(`${siteUrl}/api/internal/eve-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ characterId: character.characterId }),
      });
      if (tokenRes.status === 404) {
        // Unlinked between enumeration and vend; the next run's enumeration
        // pass deletes the doc.
        continue;
      }
      if (tokenRes.status === 409) {
        results.push(errorResult(character.characterId, 'reauth_required', etags));
        continue;
      }
      if (!tokenRes.ok) {
        results.push(errorResult(character.characterId, 'token_unavailable', etags));
        continue;
      }
      const token = (await tokenRes.json()) as EveTokenOkResponse;

      try {
        const queueRead = await readEsi(
          `/characters/${character.characterId}/skillqueue`,
          token.accessToken,
          etags.queueEtag,
          rl,
        );
        if (queueRead.kind === 'error') {
          results.push(errorResult(character.characterId, queueRead.code, etags));
          continue;
        }
        const skillsRead = await readEsi(
          `/characters/${character.characterId}/skills`,
          token.accessToken,
          etags.skillsEtag,
          rl,
        );
        if (skillsRead.kind === 'error') {
          results.push(errorResult(character.characterId, skillsRead.code, etags));
          continue;
        }

        let queueEntries: SkillQueueEntry[] | null = null;
        let queueEtag = etags.queueEtag;
        if (queueRead.kind === 'fresh') {
          queueEntries = parseSkillQueueBody(queueRead.body);
          if (queueEntries === null) {
            results.push(errorResult(character.characterId, 'contract_error', etags));
            continue;
          }
          queueEtag = queueRead.etag;
        }

        let skills: SkillTotals | null = null;
        let skillsEtag = etags.skillsEtag;
        if (skillsRead.kind === 'fresh') {
          skills = parseSkillsBody(skillsRead.body);
          if (skills === null) {
            results.push(errorResult(character.characterId, 'contract_error', etags));
            continue;
          }
          skillsEtag = skillsRead.etag;
        }

        // The next window ends when the FIRST of the two caches expires.
        const expiries = [queueRead.expiresAt, skillsRead.expiresAt].filter(
          (e): e is number => e !== null,
        );
        const expiresAt = expiries.length > 0 ? Math.min(...expiries) : Date.now() + FALLBACK_TTL_MS;

        results.push({
          characterId: character.characterId,
          queueEntries,
          skills,
          queueEtag,
          skillsEtag,
          expiresAt,
          error: null,
        });
      } catch (error) {
        if (error instanceof EsiBudgetExhaustedError) {
          // The shared budget is spent — recording it and stopping beats
          // burning the remaining characters (and a retry would refuse too).
          runError = `budget_exhausted:${error.reason}`;
          results.push(errorResult(character.characterId, 'budget_exhausted', etags));
          break;
        }
        // EsiServerError / network failure — genuinely transient; rethrow so
        // the Action Retrier retries the run (idempotent: held etags are
        // re-read and the apply is a keyed upsert).
        throw error;
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

type EsiRead =
  | { kind: 'fresh'; body: unknown; etag: string | null; expiresAt: number | null }
  | { kind: 'unchanged'; expiresAt: number | null }
  | { kind: 'error'; code: string };

// One conditional read through the shared gate. The gate never attaches
// If-None-Match to Authorization-carrying requests (its ETag cache is
// unauthenticated-only), so this tracker replays its own held ETag and the
// raw 304 passes through — the 1-token path.
async function readEsi(
  path: string,
  accessToken: string,
  heldEtag: string | null,
  rl: RlSnapshot,
): Promise<EsiRead> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` };
  if (heldEtag !== null) headers['If-None-Match'] = heldEtag;
  const res = await esiFetch(esiUrl(path), { headers });
  captureRl(res, rl);
  const expiresAt = parseExpires(res);
  if (res.status === 304) {
    // No body to read on a 304 — and no ETag header to trust either.
    return { kind: 'unchanged', expiresAt };
  }
  if (res.status === 200) {
    return {
      kind: 'fresh',
      body: (await res.json()) as unknown,
      etag: res.headers.get('ETag'),
      expiresAt,
    };
  }
  return { kind: 'error', code: `esi_${res.status}` };
}

function parseExpires(res: Response): number | null {
  const raw = res.headers.get('Expires');
  if (raw === null) return null;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function captureRl(res: Response, rl: RlSnapshot): void {
  const group = res.headers.get('X-Ratelimit-Group');
  if (group === null) return;
  rl.rlGroup = group;
  rl.rlLimit = intHeader(res, 'X-Ratelimit-Limit');
  rl.rlRemaining = intHeader(res, 'X-Ratelimit-Remaining');
  rl.rlUsed = intHeader(res, 'X-Ratelimit-Used');
}

function intHeader(res: Response, name: string): number | null {
  const raw = res.headers.get(name);
  if (raw === null) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

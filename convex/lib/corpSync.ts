// Reusable per-CORPORATION sync machinery (3.7.3.1, the first corp feature).
// The character path's leaves stay in characterSync.ts (env guard, character
// enumeration, token vend, expires resolution, subject stamp); THIS module adds
// the corp-specific shape that has no character-path analog and that the later
// corp datasets (corp blueprints 3.7.5, corp assets 3.7.7) reuse verbatim:
//
//   1. resolveCorpSubjects — fan the user's linked characters IN to a
//      deduplicated set of corporations. For each scope-eligible character it
//      vends ONE token, reads the character's corp id (public — the gate's
//      7-day shared cache makes this nearly free) and its in-game roles, then
//      groups by corp so a corp is synced ONCE per run regardless of how many of
//      the user's characters are in it. The chosen vending character's token is
//      carried on the subject and REUSED for the corp read (no second vend).
//   2. applyCorpDataset — the corp-keyed apply skeleton (generation guard →
//      corp-id orphan cleanup → upsert loop → subject stamp), parameterized by
//      simple accessors so each corp dataset injects only its own doc shape.
//
// SCOPE vs ROLE: a character missing a corp scope is the AccessGate/reconnect
// path (handled at the auth layer via the injected `canSync` predicate) and
// contributes no corp subject. The in-game role requirement is a SEPARATE axis —
// resolveCorpSubjects reads roles to set `hasRole`, and a corp whose vending
// character lacks the role is still returned (with hasRole=false) so the
// consumer can record the graceful 'needs_role' state WITHOUT spending an ESI
// call on a guaranteed 403.
import { z } from 'zod';
import type { EveCharactersResponse } from '@/features/auth/api-contract';
import { EsiBudgetExhaustedError, esiFetch, esiUrl } from '@/lib/esi';
import type { SyncDataset } from '@/lib/sync-engine';
import type { MutationCtx } from '../_generated/server';
import { stampSyncSubject, type SubjectStamp, type SyncEnv, vendCharacterToken } from './characterSync';
import { readEsi, type RlSnapshot } from './esiRead';
import { getSyncSubject } from './subjects';

type SyncCharacter = EveCharactersResponse['characters'][number];

// One resolved corporation for this run: the corp, the character whose token
// reads its endpoints, that already-vended token, and whether the vending
// character holds a required in-game role.
export interface CorpSubject {
  corporationId: number;
  vendingCharacterId: number;
  accessToken: string;
  hasRole: boolean;
}

export interface CorpResolution {
  corps: CorpSubject[];
  // ALL enumerated characters (even scope-ineligible ones) — the subject row
  // stays character-id-space, so a newly linked alt still trips the heartbeat's
  // "new character → resync" hint (it may bring a new corp or a role change).
  enumeratedCharacterIds: number[];
  // Set only when the ESI budget was exhausted mid-resolution: the run stops and
  // applies what it has, mirroring the character path's budget-stop taxonomy.
  runError: string | null;
}

// Public character info — only corporation_id is needed (the membership resolver
// in 3.7.3.2 will cache this; here it is read inline, minimally).
const publicCharacterSchema = z.object({ corporation_id: z.number().int() });

// Corp roles — only the top-level `roles` array gates endpoint access (the
// at-base/hq/other variants are office-scoped and not relevant here).
const corpRolesSchema = z.object({ roles: z.array(z.string()).optional() });

// Resolve the user's enumerated characters into deduplicated corp subjects.
// Sequential by design (gentle on the shared per-group token bucket, as the
// character trackers are). A budget exhaustion stops resolution early and is
// reported as runError; any other throw is transient and rethrown for the
// Action Retrier.
export async function resolveCorpSubjects(
  env: SyncEnv,
  characters: SyncCharacter[],
  opts: {
    canSync: (character: SyncCharacter) => boolean;
    requiredRoles: readonly string[];
    rl: RlSnapshot;
  },
): Promise<CorpResolution> {
  const enumeratedCharacterIds = characters.map((c) => c.characterId);
  const byCorp = new Map<number, CorpSubject>();
  let runError: string | null = null;

  for (const character of characters) {
    // Scope-missing → AccessGate path; it can't vend a corp read, so it
    // contributes no subject (and is NOT a corp error — granting the scope is a
    // reconnect, surfaced at the auth layer per character).
    if (!opts.canSync(character)) continue;

    const vend = await vendCharacterToken(env, character.characterId);
    // skip = unlinked between enumeration and vend; reauth/unavailable = this
    // character can't help resolve a corp right now (another character in the
    // same corp still might). Either way, no subject from this character.
    if (vend.kind !== 'token') continue;

    try {
      const corporationId = await readPublicCorpId(character.characterId);
      if (corporationId === null) continue; // can't group a character with no corp id
      const hasRole = await readCharacterHasRole(
        character.characterId,
        vend.accessToken,
        opts.requiredRoles,
        opts.rl,
      );
      mergeCorpSubject(byCorp, {
        corporationId,
        vendingCharacterId: character.characterId,
        accessToken: vend.accessToken,
        hasRole,
      });
    } catch (error) {
      if (error instanceof EsiBudgetExhaustedError) {
        runError = `budget_exhausted:${error.reason}`;
        break;
      }
      throw error;
    }
  }

  return { corps: [...byCorp.values()], enumeratedCharacterIds, runError };
}

// Dedup-by-corp: one subject per corporation. Prefer a role-holder as the
// vending character so the corp read succeeds first try (a 403 would waste error
// budget); the first role-holder wins, so the choice is stable across runs.
function mergeCorpSubject(byCorp: Map<number, CorpSubject>, candidate: CorpSubject): void {
  const existing = byCorp.get(candidate.corporationId);
  if (existing === undefined) {
    byCorp.set(candidate.corporationId, candidate);
    return;
  }
  if (!existing.hasRole && candidate.hasRole) {
    byCorp.set(candidate.corporationId, candidate);
  }
}

// PUBLIC read — NO Authorization header, so the gate treats it as ETag-eligible
// and serves it from the 7-day shared Expires-window cache with no dispatch
// (corp membership barely moves). Must NOT use readEsi, which forces a Bearer
// header and so always dispatches and never touches the shared cache.
async function readPublicCorpId(characterId: number): Promise<number | null> {
  const res = await esiFetch(esiUrl(`/characters/${characterId}`));
  if (res.status !== 200) return null;
  const parsed = publicCharacterSchema.safeParse(await res.json());
  return parsed.success ? parsed.data.corporation_id : null;
}

// AUTHED read of the character's corp roles (no held ETag — roles are read fresh
// each run; 3.7.3.2 caches membership/roles). A 403/error returns false
// (graceful "no role"), never throws — the role gate is a soft, recordable
// state, not a sync failure.
async function readCharacterHasRole(
  characterId: number,
  accessToken: string,
  requiredRoles: readonly string[],
  rl: RlSnapshot,
): Promise<boolean> {
  const read = await readEsi(`/characters/${characterId}/roles`, accessToken, null, rl);
  if (read.kind !== 'fresh') return false;
  const parsed = corpRolesSchema.safeParse(read.body);
  if (!parsed.success) return false;
  const held = new Set(parsed.data.roles ?? []);
  return requiredRoles.some((role) => held.has(role));
}

// The corp-keyed apply skeleton, shared by every corp dataset. Generation guard
// (a superseded run's late apply no-ops), corp-id-space orphan cleanup (a corp
// the user no longer reaches is deleted), the dataset's own upsert per read
// corp, then the engine subject stamp. The subject row itself stays
// character-id-space — `stamp.enumeratedCharacterIds` carries the CHARACTER ids,
// while orphan cleanup is the one corp-id-space step, internal here. Generic
// over the doc shape via accessors so a dataset injects only its table specifics.
//
// `keepCorpIds` separates two concerns deliberately:
//   - WHICH corps survive (the orphan reference) is the FULL set the run
//     resolved, which is only trustworthy when resolution completed. A budget
//     stop mid-resolution leaves the corp set unknown, so the consumer passes
//     `null` — meaning "retain every existing doc, delete nothing" — rather than
//     risk deleting a corp it simply never got to re-check.
//   - WHICH corps got fresh data this run (`upsertCorpIds`) is a possibly
//     smaller set (a corp resolved but not read after a read-loop budget stop
//     keeps its existing doc, neither deleted nor overwritten).
export async function applyCorpDataset<TDoc>(
  ctx: MutationCtx,
  opts: {
    dataset: SyncDataset;
    userId: string;
    generation: number;
    // Corps to retain (the complete resolved set); null = resolution was cut
    // short, so retain all existing docs and orphan-clean nothing.
    keepCorpIds: Set<number> | null;
    // Corps with a fresh result to upsert this run.
    upsertCorpIds: number[];
    stamp: SubjectStamp;
    now: number;
    loadExisting: () => Promise<TDoc[]>;
    corpIdOf: (doc: TDoc) => number;
    expiresAtOf: (doc: TDoc) => number | null;
    deleteDoc: (doc: TDoc) => Promise<void>;
    upsertOne: (corporationId: number) => Promise<number | null>;
  },
): Promise<void> {
  const subject = await getSyncSubject(ctx.db, opts.dataset, opts.userId);
  if (subject === null || subject.lastRequestedAt !== opts.generation) return;

  const existing = await opts.loadExisting();
  // Post-apply cache window per surviving corp, accumulated so the subject stamp
  // doesn't re-read the table. Seed from surviving docs; each upsert overwrites.
  const windowsByCorp = new Map<number, number | null>();
  for (const doc of existing) {
    const corporationId = opts.corpIdOf(doc);
    if (opts.keepCorpIds === null || opts.keepCorpIds.has(corporationId)) {
      windowsByCorp.set(corporationId, opts.expiresAtOf(doc));
    } else {
      await opts.deleteDoc(doc);
    }
  }
  for (const corporationId of opts.upsertCorpIds) {
    windowsByCorp.set(corporationId, await opts.upsertOne(corporationId));
  }

  await stampSyncSubject(ctx, subject._id, [...windowsByCorp.values()], opts.stamp, opts.now);
}

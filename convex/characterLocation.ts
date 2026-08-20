// Character location payload — the Convex half of 4.0.4.2.1 tracked location.
//
// Canonical shape: client heartbeat (engine) → chain-on-success ~5s loop
// while watched and a tracked pilot is online (30s scan is the retry/
// watchdog; the sync's own /online probe paces an all-offline subject at
// ~60s) → scheduler → characterLocationSync.syncUser (action: mapTracking
// poll set, access lease, online probe + location + ship-on-change) → applySyncResults
// (ONE batched mutation, generation-guarded) → forViewer /
// mapTracking.forMap. The client never calls the action directly.
//
// Purge remains the Neon→Convex teardown door for removed accounts/characters.
import { type Infer, v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  query,
} from './_generated/server';
import { collectByUser, viewerUserDocs } from './lib/indexedQuery';
import {
  characterSyncApplyFields,
  characterSyncResultFields,
  stampSyncSubject,
} from './lib/characterSync';
import { applyCoverageSet } from './lib/locationCoverage';
import { getSyncSubject } from './lib/subjects';
import { purgeScopeArgs } from './lib/syncFields';

/**
 * Two consecutive fresh samples must land within this window for a jump
 * verdict to trust the previous system. Larger gaps stamp prevFresh=false →
 * re-anchor. Classifier-side; not an engine cadence.
 *
 * Sized for three floors of the live location loop (~15s ESI cache + apply),
 * not the 5s cadence floor: a sitting then jumping pilot whose previous
 * covered run finished 17s ago is still watched. The 30s engine scan is the
 * watchdog when a sibling alt clears minExpiresAt; 45s still sits inside
 * that scan plus slack, and under the 60s unwatched-gap proof.
 */
export const JUMP_CONTINUITY_MS = 45_000;

/**
 * The calling user's own location docs. Map members join through
 * mapTracking.forMap; this is the personal mirror of onlineStatus.forViewer.
 * observedAt is LAST-CHANGE time (304s never touch the doc); freshness
 * consumers read the subject row's lastFinishedAt.
 */
export const forViewer = query({
  args: {},
  handler: async (ctx) =>
    viewerUserDocs(ctx, 'characterLocation', (doc) => ({
      characterId: doc.characterId,
      solarSystemId: doc.solarSystemId,
      stationId: doc.stationId,
      structureId: doc.structureId,
      shipTypeId: doc.shipTypeId,
      prevSolarSystemId: doc.prevSolarSystemId,
      prevFresh: doc.prevFresh,
      transitionObservedAt: doc.transitionObservedAt ?? null,
      observedAt: doc.observedAt,
    })),
});

/**
 * The action's read seam: which ETags to replay per character for the
 * conditional location and ship reads, plus the held online-probe state
 * (flag, ETag, cache window). ONE internalQuery — both tables read in the
 * same transaction, so the etag-beside-value invariants hold across a single
 * snapshot (two runQuery calls would each get their own).
 */
export const heldState = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const locations = await ctx.db
      .query('characterLocation')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    const online = await ctx.db
      .query('characterLocationOnline')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return {
      locations: locations.map((doc) => ({
        characterId: doc.characterId,
        solarSystemId: doc.solarSystemId,
        etagLocation: doc.etagLocation,
        etagShip: doc.etagShip,
      })),
      online: online.map((doc) => ({
        characterId: doc.characterId,
        online: doc.online,
        etagOnline: doc.etagOnline,
        onlineExpiresAt: doc.onlineExpiresAt,
      })),
    };
  },
});

/**
 * Access-token leases for this user. Internal-only — never on forViewer / forMap.
 */
export const accessLeases = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const rows = await collectByUser(ctx, 'characterLocationAccess', userId);
    return rows.map((row) => ({
      characterId: row.characterId,
      accessToken: row.accessToken,
      expiresAt: row.expiresAt,
    }));
  },
});

/**
 * Upsert one character's EVE access-token lease. Stores Neon's expiresAt.
 */
export const putAccessLease = internalMutation({
  args: {
    userId: v.string(),
    characterId: v.number(),
    accessToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    // Same mutation as the write: unlink/transfer purge deletes tracking with
    // the lease, so a late upsert cannot resurrect a credential after teardown.
    // Untrack also removes tracking and skips this write; any already-held lease
    // stays (CONVEX.md), and the next tracked run vends again.
    const tracking = await ctx.db
      .query('mapTracking')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', args.userId).eq('characterId', args.characterId),
      )
      .first();
    if (tracking === null) return;
    const existing = await ctx.db
      .query('characterLocationAccess')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', args.userId).eq('characterId', args.characterId),
      )
      .unique();
    const now = Date.now();
    if (existing !== null) {
      await ctx.db.patch(existing._id, {
        accessToken: args.accessToken,
        expiresAt: args.expiresAt,
        updatedAt: now,
      });
      return;
    }
    await ctx.db.insert('characterLocationAccess', {
      userId: args.userId,
      characterId: args.characterId,
      accessToken: args.accessToken,
      expiresAt: args.expiresAt,
      updatedAt: now,
    });
  },
});

/**
 * Drop one character's access lease. ESI 401/403 means the held token is dead;
 * the next sync vends again instead of replaying it until Neon expiresAt.
 * Idempotent when the row is already gone. Does not touch location or tracking.
 */
export const clearAccessLease = internalMutation({
  args: {
    userId: v.string(),
    characterId: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('characterLocationAccess')
      .withIndex('by_user_character', (q) =>
        q.eq('userId', args.userId).eq('characterId', args.characterId),
      )
      .unique();
    if (existing !== null) await ctx.db.delete(existing._id);
  },
});

// Per-character outcome the action hands back. `solarSystemId` null means a
// 304, an offline probe, or an error (then `error` is set). Offline pilots
// keep any held location (collapse retention / last-known); map presence
// hides that pin unless the owner's feed currently covers the character. A
// 304 (`online: true` + null system) still writes nothing to the payload
// table. The probe trio: `online` null = probe never resolved;
// `onlineExpiresAt` non-null = a fresh probe read to upsert into
// characterLocationOnline (null = held-reuse).
const characterResultValidator = v.object({
  ...characterSyncResultFields,
  solarSystemId: v.union(v.number(), v.null()),
  stationId: v.union(v.number(), v.null()),
  structureId: v.union(v.number(), v.null()),
  shipTypeId: v.union(v.number(), v.null()),
  systemChanged: v.boolean(),
  etagLocation: v.union(v.string(), v.null()),
  etagShip: v.union(v.string(), v.null()),
  online: v.union(v.boolean(), v.null()),
  etagOnline: v.union(v.string(), v.null()),
  onlineExpiresAt: v.union(v.number(), v.null()),
});

type CharacterResult = Infer<typeof characterResultValidator>;

/**
 * The run's single batched write. Idempotent upserts keyed by
 * userId+characterId; the generation guard makes a superseded run's late apply
 * a no-op. Stamps syncedCharacterIds from the tracked poll set so a newly
 * tracked hint goes stale immediately. Unlinked characters are torn down by
 * purgeForUser, not this apply.
 */
export const applySyncResults = internalMutation({
  args: {
    ...characterSyncApplyFields,
    trackedCharacterIds: v.array(v.number()),
    results: v.array(characterResultValidator),
  },
  handler: async (ctx, args) => {
    const subject = await getSyncSubject(ctx.db, 'characterLocation', args.userId);
    if (subject === null || subject.lastRequestedAt !== args.generation) return;

    const docs = await ctx.db
      .query('characterLocation')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    const onlineDocs = await ctx.db
      .query('characterLocationOnline')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    const byCharacter = indexByCharacter(docs);
    const onlineByCharacter = indexByCharacter(onlineDocs);
    const now = Date.now();

    const outcome = await applyCharacterResults(ctx, args, byCharacter, onlineByCharacter, subject, now);

    await stampSyncSubject(
      ctx,
      subject._id,
      outcome.windows,
      {
        enumeratedCharacterIds: args.trackedCharacterIds,
        coveredCharacterIds: outcome.coveredCharacterIds,
        lastError: args.lastError,
        rlGroup: args.rlGroup,
        rlLimit: args.rlLimit,
        rlRemaining: args.rlRemaining,
        rlUsed: args.rlUsed,
      },
      now,
    );
    await applyCoverageSet(
      ctx,
      args.userId,
      args.trackedCharacterIds,
      outcome.coveredCharacterIds,
    );
  },
});

// Index one payload table's rows by character. Unlinked characters are
// removed by purgeForUser (unlink/reassign/user-delete/owner-hash), not here — feeding
// the tracked set into a delete-if-missing pass would turn untrack into a
// destroy of last-known location.
function indexByCharacter<D extends { characterId: number }>(docs: D[]): Map<number, D> {
  const byCharacter = new Map<number, D>();
  for (const doc of docs) {
    byCharacter.set(doc.characterId, doc);
  }
  return byCharacter;
}

// The per-result loop, split from the handler: probe upsert + location apply
// per character, accumulating the subject stamp inputs. The covered set is
// this run's continuity truth — characters whose LOCATION was observed
// cleanly (fresh 200 OR 304); offline probe results, per-character errors,
// and unpolled characters are all excluded so they re-anchor on recovery
// instead of inheriting an invented path from the tracked set.
async function applyCharacterResults(
  ctx: MutationCtx,
  args: { userId: string; enumeratedCharacterIds: number[]; results: CharacterResult[] },
  byCharacter: Map<number, Doc<'characterLocation'>>,
  onlineByCharacter: Map<number, Doc<'characterLocationOnline'>>,
  subject: Doc<'syncSubjects'>,
  now: number,
): Promise<{ windows: Array<number | null>; coveredCharacterIds: number[] }> {
  const enumerated = new Set(args.enumeratedCharacterIds);
  const windowsByCharacter = new Map<number, number | null>();
  const coveredCharacterIds: number[] = [];
  for (const result of args.results) {
    if (!enumerated.has(result.characterId)) continue;
    // Covered = the LOCATION was observed this run (probe said online and the
    // location path ran — fresh 200 OR 304). An offline probe "success" never
    // enters: it observed no location, and continuity built on probe-only
    // samples would let a pilot who logged in and moved inside the held ~60s
    // window author a fabricated jump (prevFresh must mean "we watched the
    // previous system", not "the run went cleanly").
    if (result.error === null && result.online === true) {
      coveredCharacterIds.push(result.characterId);
    }
    await applyOnlineProbeResult(ctx, args.userId, result, onlineByCharacter.get(result.characterId));
    const window = await applyLocationResult(
      ctx,
      args.userId,
      result,
      byCharacter.get(result.characterId),
      subject,
      now,
    );
    windowsByCharacter.set(result.characterId, window);
  }
  return { windows: [...windowsByCharacter.values()], coveredCharacterIds };
}

// Upsert one character's held online-probe state. Only a fresh probe read
// carries a non-null onlineExpiresAt (held-reuse and errors carry null →
// nothing to store). The table is unsubscribed, so the per-read expiry write
// (~1/min) invalidates nothing; the write still happens only when something
// actually changed.
async function applyOnlineProbeResult(
  ctx: MutationCtx,
  userId: string,
  result: CharacterResult,
  existing: Doc<'characterLocationOnline'> | undefined,
): Promise<void> {
  if (result.online === null || result.onlineExpiresAt === null) return;
  if (existing === undefined) {
    await ctx.db.insert('characterLocationOnline', {
      userId,
      characterId: result.characterId,
      online: result.online,
      etagOnline: result.etagOnline,
      onlineExpiresAt: result.onlineExpiresAt,
    });
    return;
  }
  if (
    existing.online !== result.online
    || existing.etagOnline !== result.etagOnline
    || existing.onlineExpiresAt !== result.onlineExpiresAt
  ) {
    await ctx.db.patch(existing._id, {
      online: result.online,
      etagOnline: result.etagOnline,
      onlineExpiresAt: result.onlineExpiresAt,
    });
  }
}

async function applyLocationResult(
  ctx: MutationCtx,
  userId: string,
  result: CharacterResult,
  existing: Doc<'characterLocation'> | undefined,
  subject: Doc<'syncSubjects'>,
  now: number,
): Promise<number | null> {
  if (result.error !== null) return null;
  // 304 / offline — location unchanged; write nothing (HC-3 zero-write path).
  // Held last-known stays for collapse retention. Presence hides the pin
  // unless the owner's feed currently covers this character.
  if (result.solarSystemId === null) return result.expiresAt;

  const prevFresh = isPrevFresh(subject, result.characterId, now);

  if (existing === undefined) {
    await ctx.db.insert('characterLocation', {
      userId,
      characterId: result.characterId,
      solarSystemId: result.solarSystemId,
      stationId: result.stationId,
      structureId: result.structureId,
      shipTypeId: result.shipTypeId,
      prevSolarSystemId: null,
      prevFresh: false,
      transitionObservedAt: now,
      observedAt: now,
      etagLocation: result.etagLocation,
      etagShip: result.etagShip,
    });
    return result.expiresAt;
  }

  if (result.systemChanged) {
    // shipTypeId null on a system change means the ship read 304'd — keep held.
    const shipTypeId = result.shipTypeId ?? existing.shipTypeId;
    const next = {
      solarSystemId: result.solarSystemId,
      stationId: result.stationId,
      structureId: result.structureId,
      shipTypeId,
      prevSolarSystemId: existing.solarSystemId,
      prevFresh,
      transitionObservedAt: now,
      observedAt: now,
      etagLocation: result.etagLocation,
      etagShip: result.etagShip,
    };
    if (locationChanged(existing, next)) {
      await ctx.db.patch(existing._id, next);
    }
    return result.expiresAt;
  }

  // Same system — dock/undock/station fact only; keep prev* and held ship.
  const next = {
    stationId: result.stationId,
    structureId: result.structureId,
    observedAt: now,
    etagLocation: result.etagLocation,
  };
  if (
    existing.stationId !== next.stationId
    || existing.structureId !== next.structureId
    || existing.etagLocation !== next.etagLocation
  ) {
    await ctx.db.patch(existing._id, next);
  }
  return result.expiresAt;
}

function isPrevFresh(
  subject: Doc<'syncSubjects'>,
  characterId: number,
  now: number,
): boolean {
  if (subject.lastFinishedAt === null) return false;
  if (now - subject.lastFinishedAt > JUMP_CONTINUITY_MS) return false;
  // Membership in the PREVIOUS run's covered set — not syncedCharacterIds
  // (the tracked/hint set): a character whose last sample was an error or
  // that went unpolled (budget stop) must re-anchor, never trust a stale
  // prev-system as jump provenance (PD-2's "no invented path").
  return (subject.coveredCharacterIds ?? []).includes(characterId);
}

function locationChanged(
  existing: Doc<'characterLocation'>,
  next: {
    solarSystemId: number;
    stationId: number | null;
    structureId: number | null;
    shipTypeId: number | null;
    prevSolarSystemId: number | null;
    prevFresh: boolean;
    transitionObservedAt: number;
    etagLocation: string | null;
    etagShip: string | null;
  },
): boolean {
  return (
    existing.solarSystemId !== next.solarSystemId
    || existing.stationId !== next.stationId
    || existing.structureId !== next.structureId
    || existing.shipTypeId !== next.shipTypeId
    || existing.prevSolarSystemId !== next.prevSolarSystemId
    || existing.prevFresh !== next.prevFresh
    || existing.transitionObservedAt !== next.transitionObservedAt
    || existing.etagLocation !== next.etagLocation
    || existing.etagShip !== next.etagShip
  );
}

/**
 * Explicit teardown for a Neon-side account/character purge. characterId null
 * tears down the whole user (account-nuke): every characterLocation doc,
 * held online-probe row, access lease, and mapTracking row for that user. A number tears
 * down one character. Idempotent: deleting absent rows is a no-op.
 */
export const purgeForUser = internalMutation({
  args: purgeScopeArgs,
  handler: async (ctx, { userId, characterId }) => {
    // One indexed, user-bounded read per table (by_user_character prefix on
    // userId — a purge is rare and a user's rows are few), then the scope
    // narrows in JS: a single-character purge keeps only that character.
    const scoped = <D extends { characterId: number }>(docs: D[]) =>
      characterId === null ? docs : docs.filter((doc) => doc.characterId === characterId);

    const locations = scoped(
      await ctx.db.query('characterLocation').withIndex('by_user_character', (q) => q.eq('userId', userId)).collect(),
    );
    const heldOnline = scoped(
      await ctx.db.query('characterLocationOnline').withIndex('by_user_character', (q) => q.eq('userId', userId)).collect(),
    );
    const tracking = scoped(
      await ctx.db.query('mapTracking').withIndex('by_user_character', (q) => q.eq('userId', userId)).collect(),
    );
    const accessLeases = scoped(
      await ctx.db.query('characterLocationAccess').withIndex('by_user_character', (q) => q.eq('userId', userId)).collect(),
    );
    const covered = scoped(
      await ctx.db.query('characterLocationCovered').withIndex('by_user_character', (q) => q.eq('userId', userId)).collect(),
    );

    for (const doc of locations) await ctx.db.delete(doc._id);
    for (const doc of heldOnline) await ctx.db.delete(doc._id);
    for (const doc of tracking) await ctx.db.delete(doc._id);
    for (const doc of accessLeases) await ctx.db.delete(doc._id);
    for (const doc of covered) await ctx.db.delete(doc._id);

    // Jump-bookkeeping stamps are character-keyed and deliberately survive
    // untrack/retrack, but an account/character purge removes the character
    // from the platform — the stamps' double-count protection no longer
    // applies, so they purge here. Account-nuke (characterId null) drains the
    // characters this purge could still enumerate from its own rows.
    const stampCharacterIds =
      characterId !== null
        ? [characterId]
        : [
            ...new Set(
              [...locations, ...tracking].map((doc) => doc.characterId),
            ),
          ];
    let deletedBookkeeping = 0;
    for (const stampCharacterId of stampCharacterIds) {
      const stamps = await ctx.db
        .query('mapJumpBookkeeping')
        .withIndex('by_character', (q) =>
          q.eq('characterId', stampCharacterId),
        )
        .collect();
      for (const doc of stamps) {
        await ctx.db.delete(doc._id);
        deletedBookkeeping += 1;
      }
    }
    return {
      deletedLocations: locations.length,
      deletedTracking: tracking.length,
      deletedBookkeeping,
    };
  },
});

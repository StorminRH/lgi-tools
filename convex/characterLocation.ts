// Character location payload — the Convex half of 4.0.4.2.1 tracked location.
//
// Canonical shape (mirrors the onlineStatus canary): client heartbeat (engine)
// → chain-on-success ~5s loop while watched (30s scan is the retry/watchdog)
// → Workpool → characterLocationSync.syncUser (action: Neon enum ∩
// mapTracking, location + ship-on-change) → applySyncResults (ONE batched
// mutation, generation-guarded; movement nudges onlineStatus due-now) →
// forViewer / mapTracking.forMap. The client never calls the action directly.
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
import { stampSyncSubject } from './lib/characterSync';
import { getSyncSubject } from './lib/subjects';

/**
 * Two consecutive fresh samples must land within this window for a jump
 * verdict to trust the previous system (three 5s cadence floors). Larger gaps
 * stamp prevFresh=false → re-anchor. Classifier-side; not an engine cadence.
 */
export const JUMP_CONTINUITY_MS = 15_000;

/**
 * The calling user's own location docs. Map members join through
 * mapTracking.forMap; this is the personal mirror of onlineStatus.forViewer.
 * observedAt is LAST-CHANGE time (304s never touch the doc); freshness
 * consumers read the subject row's lastFinishedAt.
 */
export const forViewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) return null;
    const userId = identity.subject;
    const docs = await ctx.db
      .query('characterLocation')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return {
      characters: docs.map((doc) => ({
        characterId: doc.characterId,
        solarSystemId: doc.solarSystemId,
        stationId: doc.stationId,
        structureId: doc.structureId,
        shipTypeId: doc.shipTypeId,
        prevSolarSystemId: doc.prevSolarSystemId,
        prevFresh: doc.prevFresh,
        observedAt: doc.observedAt,
      })),
    };
  },
});

/**
 * The action's read seam: which ETags to replay per character for the
 * conditional location and ship reads.
 */
export const heldState = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const docs = await ctx.db
      .query('characterLocation')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    return docs.map((doc) => ({
      characterId: doc.characterId,
      solarSystemId: doc.solarSystemId,
      etagLocation: doc.etagLocation,
      etagShip: doc.etagShip,
    }));
  },
});

// Per-character outcome the action hands back. `solarSystemId` null means a
// 304 (or an error — then `error` is set): write nothing to the payload table.
// `systemChanged` is true when the action fetched ship because the system
// moved (or there was no prior doc).
const characterResultValidator = v.object({
  characterId: v.number(),
  solarSystemId: v.union(v.number(), v.null()),
  stationId: v.union(v.number(), v.null()),
  structureId: v.union(v.number(), v.null()),
  shipTypeId: v.union(v.number(), v.null()),
  systemChanged: v.boolean(),
  etagLocation: v.union(v.string(), v.null()),
  etagShip: v.union(v.string(), v.null()),
  expiresAt: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
});

type CharacterResult = Infer<typeof characterResultValidator>;

/**
 * The run's single batched write. Idempotent upserts keyed by
 * userId+characterId; the generation guard makes a superseded run's late apply
 * a no-op. Orphan-cleans against the full Neon enumeration; stamps
 * syncedCharacterIds from the tracked poll set so a newly tracked hint goes
 * stale immediately.
 */
export const applySyncResults = internalMutation({
  args: {
    userId: v.string(),
    generation: v.number(),
    enumeratedCharacterIds: v.array(v.number()),
    trackedCharacterIds: v.array(v.number()),
    results: v.array(characterResultValidator),
    lastError: v.union(v.string(), v.null()),
    rlGroup: v.union(v.string(), v.null()),
    rlLimit: v.union(v.number(), v.null()),
    rlRemaining: v.union(v.number(), v.null()),
    rlUsed: v.union(v.number(), v.null()),
  },
  handler: async (ctx, args) => {
    const subject = await getSyncSubject(ctx.db, 'characterLocation', args.userId);
    if (subject === null || subject.lastRequestedAt !== args.generation) return;

    const docs = await ctx.db
      .query('characterLocation')
      .withIndex('by_user', (q) => q.eq('userId', args.userId))
      .collect();
    const byCharacter = new Map(docs.map((doc) => [doc.characterId, doc]));
    const now = Date.now();
    const enumerated = new Set(args.enumeratedCharacterIds);

    for (const doc of docs) {
      if (!enumerated.has(doc.characterId)) await ctx.db.delete(doc._id);
    }

    const windowsByCharacter = new Map<number, number | null>();
    // This run's continuity set: characters actually observed cleanly (fresh
    // 200 OR 304). Per-character errors and unpolled characters are excluded,
    // so a character that erred or was skipped (budget stop) re-anchors on
    // recovery instead of inheriting an invented path from the tracked set.
    const coveredCharacterIds: number[] = [];
    let sawMovement = false;
    for (const result of args.results) {
      if (!enumerated.has(result.characterId)) continue;
      if (result.error === null) coveredCharacterIds.push(result.characterId);
      const window = await applyLocationResult(
        ctx,
        args.userId,
        result,
        byCharacter.get(result.characterId),
        subject,
        now,
      );
      windowsByCharacter.set(result.characterId, window);
      // systemChanged covers first sample and a system hop; 304 / dock-only
      // leave it false so stationary windows never nudge onlineStatus.
      if (result.error === null && result.solarSystemId !== null && result.systemChanged) {
        sawMovement = true;
      }
    }

    await stampSyncSubject(
      ctx,
      subject._id,
      [...windowsByCharacter.values()],
      {
        enumeratedCharacterIds: args.trackedCharacterIds,
        coveredCharacterIds,
        lastError: args.lastError,
        rlGroup: args.rlGroup,
        rlLimit: args.rlLimit,
        rlRemaining: args.rlRemaining,
        rlUsed: args.rlUsed,
      },
      now,
    );

    if (sawMovement) await nudgeOnlineStatusDueNow(ctx, args.userId, now);
  },
});

/**
 * Pull the user's onlineStatus subject into the scan's due range so the
 * online dot catches a fresh login/jump without gating location on the 60s
 * online cache. Absent or already-due subjects are left alone.
 */
async function nudgeOnlineStatusDueNow(
  ctx: MutationCtx,
  userId: string,
  now: number,
): Promise<void> {
  const online = await getSyncSubject(ctx.db, 'onlineStatus', userId);
  if (online === null) return;
  if (online.nextDueAt !== null && online.nextDueAt <= now) return;
  await ctx.db.patch(online._id, { nextDueAt: now });
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
  // 304 — location unchanged; write nothing (HC-3 zero-write stationary path).
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
    || existing.etagLocation !== next.etagLocation
    || existing.etagShip !== next.etagShip
  );
}

/**
 * Explicit teardown for a Neon-side account/character purge. characterId null
 * tears down the whole user (account-nuke): every characterLocation doc and
 * every mapTracking row for that user. A number tears down one character.
 * Idempotent: deleting absent rows is a no-op.
 */
export const purgeForUser = internalMutation({
  args: { userId: v.string(), characterId: v.union(v.number(), v.null()) },
  handler: async (ctx, { userId, characterId }) => {
    const locations =
      characterId === null
        ? await ctx.db
            .query('characterLocation')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect()
        : await ctx.db
            .query('characterLocation')
            .withIndex('by_user_character', (q) =>
              q.eq('userId', userId).eq('characterId', characterId),
            )
            .collect();

    const tracking =
      characterId === null
        ? await ctx.db
            .query('mapTracking')
            .withIndex('by_user_character', (q) => q.eq('userId', userId))
            .collect()
        : await ctx.db
            .query('mapTracking')
            .withIndex('by_user_character', (q) =>
              q.eq('userId', userId).eq('characterId', characterId),
            )
            .collect();

    for (const doc of locations) await ctx.db.delete(doc._id);
    for (const doc of tracking) await ctx.db.delete(doc._id);
    return {
      deletedLocations: locations.length,
      deletedTracking: tracking.length,
    };
  },
});

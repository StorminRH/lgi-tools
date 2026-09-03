import { type Infer, v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { internalMutation, type MutationCtx } from './_generated/server';
import {
  characterSyncApplyFields,
  characterSyncResultFields,
  stampSyncSubject,
} from './lib/characterSync';
import { applyCoverageSet } from './lib/locationCoverage';
import { getSyncSubject } from './lib/subjects';

export const JUMP_CONTINUITY_MS = 45_000;

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

function indexByCharacter<D extends { characterId: number }>(docs: D[]): Map<number, D> {
  const byCharacter = new Map<number, D>();
  for (const doc of docs) {
    byCharacter.set(doc.characterId, doc);
  }
  return byCharacter;
}

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

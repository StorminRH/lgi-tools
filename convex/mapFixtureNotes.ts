import { ConvexError, v } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import {
  noteTargetKindValidator,
  type NoteTargetKind,
} from './lib/mapEntityContracts';

export const insertNoteFixture = internalMutation({
  args: {
    mapId: v.string(),
    targetKind: noteTargetKindValidator,
    targetId: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    await requireNoteTarget(ctx, args.mapId, args.targetKind, args.targetId);
    return await ctx.db.insert('mapNotes', args);
  },
});

async function requireNoteTarget(
  ctx: MutationCtx,
  mapId: string,
  targetKind: NoteTargetKind,
  targetId: string,
): Promise<void> {
  if (targetKind === 'map') {
    if (targetId !== mapId) {
      throw new ConvexError({
        code: 'INVALID_NOTE_TARGET',
        detail: 'A map note must target its own map.',
      });
    }
    return;
  }

  const table = targetKind === 'system' ? 'mapSystems' : 'mapSignatures';
  const id = ctx.db.normalizeId(table, targetId);
  const target = id === null ? null : await ctx.db.get(id);
  if (target === null || target.mapId !== mapId) {
    throw new ConvexError({
      code: 'INVALID_NOTE_TARGET',
      detail: `No ${targetKind} ${targetId} on map ${mapId}.`,
    });
  }
}

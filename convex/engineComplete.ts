import { v } from 'convex/values';
import { LOCATION_COLD_AFTER_MS, isColdFromPresence } from '@/lib/sync-engine';
import { internalMutation, type MutationCtx } from './_generated/server';
import { ensureLocationSync, runState, scheduleRun } from './lib/locationSchedule';
import { getPresence } from './lib/subjects';

/**
 * Deploy-transition stand-ins for the retired scan engine. A chain hop or an
 * in-flight run scheduled by the previous deployment still calls these names
 * once; each hands the user to the location scheduler if nothing is scheduled
 * for them. Delete once no pre-scheduler job can remain.
 */
async function handOff(ctx: MutationCtx, userId: string): Promise<void> {
  const now = Date.now();
  const presence = await getPresence(ctx.db, 'characterLocation', userId);
  if (isColdFromPresence(presence, LOCATION_COLD_AFTER_MS, now)) return;
  const state = await ensureLocationSync(ctx, userId);
  if (await runState(ctx.db, state) !== 'none') return;
  await ctx.db.patch('locationSync', state._id, await scheduleRun(ctx, state, now, now));
}

export const chainDispatch = internalMutation({
  args: { dataset: v.literal('characterLocation'), userId: v.string() },
  handler: async (ctx, { userId }) => handOff(ctx, userId),
});

export const onSyncComplete = internalMutation({
  args: {
    workId: v.string(),
    context: v.object({ dataset: v.literal('characterLocation'), userId: v.string() }),
    result: v.union(
      v.object({ kind: v.literal('success') }),
      v.object({ kind: v.literal('failed'), error: v.string() }),
    ),
  },
  handler: async (ctx, { context }) => handOff(ctx, context.userId),
});

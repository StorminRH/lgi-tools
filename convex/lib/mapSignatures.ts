import { ConvexError } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export const SIGNATURE_ACTIVITY_STALE_MS = 60_000;

export interface SignatureKey {
  readonly mapId: string;
  readonly systemId: number;
  readonly signatureId: string;
}

export function findMapSignature(ctx: QueryCtx, key: SignatureKey) {
  return ctx.db
    .query('mapSignatures')
    .withIndex('by_map_signature', (q) =>
      q.eq('mapId', key.mapId).eq('systemId', key.systemId).eq('signatureId', key.signatureId),
    )
    .unique();
}

export function findSignatureActivity(ctx: QueryCtx, key: SignatureKey) {
  return ctx.db
    .query('mapSignatureActivity')
    .withIndex('by_map_signature', (q) =>
      q.eq('mapId', key.mapId).eq('systemId', key.systemId).eq('signatureId', key.signatureId),
    )
    .unique();
}

export async function touchSignatureActivity(
  ctx: MutationCtx,
  key: SignatureKey,
  observedAt = Date.now(),
): Promise<'inserted' | 'patched' | 'unchanged'> {
  const existing = await findSignatureActivity(ctx, key);
  return await touchKnownSignatureActivity(ctx, key, existing, observedAt);
}

export async function touchKnownSignatureActivity(
  ctx: MutationCtx,
  key: SignatureKey,
  existing: Doc<'mapSignatureActivity'> | null,
  observedAt = Date.now(),
): Promise<'inserted' | 'patched' | 'unchanged'> {
  if (existing === null) {
    await ctx.db.insert('mapSignatureActivity', { ...key, lastSeenAt: observedAt });
    return 'inserted';
  }
  if (observedAt - existing.lastSeenAt < SIGNATURE_ACTIVITY_STALE_MS) return 'unchanged';
  await ctx.db.patch(existing._id, { lastSeenAt: observedAt });
  return 'patched';
}

export async function deleteSignatureActivity(
  ctx: MutationCtx,
  key: SignatureKey,
): Promise<void> {
  const activity = await findSignatureActivity(ctx, key);
  if (activity !== null) await ctx.db.delete(activity._id);
}

export async function applySignatureTombstone(
  ctx: MutationCtx,
  key: SignatureKey,
  deletedAt: number | null,
  purgeAfter: number | null,
): Promise<{ readonly tombstoned: boolean; readonly changed: boolean }> {
  requireTombstonePair(deletedAt, purgeAfter);
  const signature = await findMapSignature(ctx, key);
  if (signature === null) {
    throw new ConvexError({
      code: 'UNKNOWN_SIGNATURE',
      detail: `No signature ${key.signatureId} on map ${key.mapId}.`,
    });
  }
  const activity = deletedAt === null ? null : await findSignatureActivity(ctx, key);
  return await applyKnownSignatureTombstone(ctx, signature, activity, deletedAt, purgeAfter);
}

export async function applyKnownSignatureTombstone(
  ctx: MutationCtx,
  signature: Doc<'mapSignatures'>,
  activity: Doc<'mapSignatureActivity'> | null,
  deletedAt: number | null,
  purgeAfter: number | null,
): Promise<{ readonly tombstoned: boolean; readonly changed: boolean }> {
  requireTombstonePair(deletedAt, purgeAfter);
  if (signature.deletedAt === deletedAt && signature.purgeAfter === purgeAfter) {
    return { tombstoned: deletedAt !== null, changed: false };
  }
  await ctx.db.patch(signature._id, { deletedAt, purgeAfter });
  if (deletedAt !== null && activity !== null) await ctx.db.delete(activity._id);
  return { tombstoned: deletedAt !== null, changed: true };
}

function requireTombstonePair(deletedAt: number | null, purgeAfter: number | null): void {
  if (deletedAt === null && purgeAfter === null) return;
  const paired = deletedAt !== null
    && purgeAfter !== null
    && Number.isFinite(deletedAt)
    && Number.isFinite(purgeAfter)
    && purgeAfter > deletedAt;
  if (!paired) {
    throw new ConvexError({
      code: 'INVALID_TOMBSTONE',
      detail: 'deletedAt and purgeAfter must both be null, or both finite with purgeAfter later.',
    });
  }
}

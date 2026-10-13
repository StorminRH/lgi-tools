import { type TestConvex } from 'convex-test';
import type { FunctionArgs, FunctionReturnType } from 'convex/server';
import { ConvexError, type Value } from 'convex/values';
import { expect, vi } from 'vitest';
import type { MapRole } from '@/data/maps/access-contract';
import { internal } from '../_generated/api';
import schema from '../schema';

export type Chain = TestConvex<typeof schema>;

/** Seeds one claim row directly, bypassing the projection's checks. */
export async function grantMapAccess(
  t: Chain,
  mapId: string,
  userId: string,
  roles: MapRole[],
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert('mapAccess', { mapId, userId, roles });
  });
}

/** Delivers claim sets through the projection with a fresh, increasing revision each call. */
export function claimReconciler(t: Chain) {
  let revision = 0;
  return (
    mapId: string,
    claims: FunctionArgs<typeof internal.mapAccessProjection.reconcileMapClaims>['claims'],
  ): Promise<FunctionReturnType<typeof internal.mapAccessProjection.reconcileMapClaims>> => {
    revision += 1;
    return t.mutation(internal.mapAccessProjection.reconcileMapClaims, { mapId, revision, claims });
  };
}

/**
 * Asserts that `call` rejects with a ConvexError whose `data.code` is exactly `code`,
 * and returns that error. A resolved call, a plain Error, a string-data ConvexError,
 * or a code that merely contains `code` all fail.
 */
export const expectConvexErrorCode = vi.defineHelper(
  async (call: Promise<unknown>, code: string): Promise<ConvexError<{ code: string }>> => {
    const error = await call.then(
      () => expect.unreachable(`expected ConvexError ${code}, but the call resolved`),
      (rejection: unknown) => rejection,
    );
    expect(error).toBeInstanceOf(ConvexError);
    const { data } = error as ConvexError<Value>;
    expect(data).toEqual(expect.objectContaining({ code }));
    return error as ConvexError<{ code: string }>;
  },
);

/** Every scheduled job whose function path contains `nameFragment`, in any state. */
export async function scheduledFunctionsNamed(t: Chain, nameFragment: string) {
  return t.run(async (ctx) => {
    const rows = await ctx.db.system.query('_scheduled_functions').collect();
    return rows.filter((row) => row.name.includes(nameFragment));
  });
}

import { resolveMapPrincipals } from '@/composition/map-access';
import {
  projectMapAccess,
  ProjectionUnavailableError,
  requireCurrentProjection,
  teardownMapAccessProjection,
} from '@/composition/map-access-projection';
import type { MapLifecycleRequest } from '@/data/maps/api-contract';
import {
  archiveAuthorizedMap,
  requestAuthorizedMapPurge,
  restoreAuthorizedMap,
} from '@/data/maps/lifecycle';

export type LifecycleResult =
  | { readonly ok: true; readonly projectionPending: boolean }
  | { readonly ok: false };

export interface MapLifecycleDependencies {
  readonly resolvePrincipals?: typeof resolveMapPrincipals;
  readonly archiveMap?: typeof archiveAuthorizedMap;
  readonly restoreMap?: typeof restoreAuthorizedMap;
  readonly requestPurge?: typeof requestAuthorizedMapPurge;
  readonly projectAccess?: typeof projectMapAccess;
  readonly teardownAccess?: typeof teardownMapAccessProjection;
}

/** Archives one admin-authorized map, then tears down its live projection. */
export async function deleteMapForUser(
  userId: string,
  input: MapLifecycleRequest,
  dependencies: MapLifecycleDependencies = {},
): Promise<LifecycleResult> {
  const principals = await (dependencies.resolvePrincipals ?? resolveMapPrincipals)(userId);
  const archived = await (dependencies.archiveMap ?? archiveAuthorizedMap)(
    userId,
    principals,
    input.mapId,
  );
  if (!archived) return { ok: false };
  try {
    requireCurrentProjection(
      await (dependencies.teardownAccess ?? teardownMapAccessProjection)(input.mapId),
    );
    return { ok: true, projectionPending: false };
  } catch (cause) {
    if (!(cause instanceof ProjectionUnavailableError)) throw cause;
    console.error('[maps] archived map projection teardown pending resync', {
      mapId: input.mapId,
      cause,
    });
    return { ok: true, projectionPending: true };
  }
}

/** Restores one in-grace admin-authorized map, then rebuilds its live projection. */
export async function restoreMapForUser(
  userId: string,
  input: MapLifecycleRequest,
  dependencies: MapLifecycleDependencies = {},
): Promise<LifecycleResult> {
  const principals = await (dependencies.resolvePrincipals ?? resolveMapPrincipals)(userId);
  const restored = await (dependencies.restoreMap ?? restoreAuthorizedMap)(
    userId,
    principals,
    input.mapId,
  );
  if (!restored) return { ok: false };
  try {
    requireCurrentProjection(
      await (dependencies.projectAccess ?? projectMapAccess)(input.mapId),
    );
    return { ok: true, projectionPending: false };
  } catch (cause) {
    if (!(cause instanceof ProjectionUnavailableError)) throw cause;
    console.error('[maps] restored map projection pending resync', {
      mapId: input.mapId,
      cause,
    });
    return { ok: true, projectionPending: true };
  }
}

/** Queues one creator-owned archived map for the next scheduled purge. */
export async function requestMapPurgeForUser(
  userId: string,
  input: MapLifecycleRequest,
  dependencies: MapLifecycleDependencies = {},
): Promise<{ readonly ok: boolean }> {
  return {
    ok: await (dependencies.requestPurge ?? requestAuthorizedMapPurge)(
      userId,
      input.mapId,
    ),
  };
}

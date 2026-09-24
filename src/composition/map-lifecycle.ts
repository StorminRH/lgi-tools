import { resolveMapPrincipals } from '@/composition/map-access';
import {
  projectMapAccess,
  ProjectionUnavailableError,
  requireCurrentProjection,
  type ProjectionResult,
} from '@/composition/map-access-projection';
import type { MapLifecycleRequest } from '@/data/maps/api-contract';
import {
  archiveAuthorizedMap,
  requestAuthorizedMapPurge,
  restoreAuthorizedMap,
} from '@/data/maps/lifecycle';
import type { PendingMapAccessChange } from '@/data/maps/authorization-sql';
import { acknowledgeMapAccessChanges } from '@/platform/auth/affiliation-store';

export type LifecycleResult =
  | { readonly ok: true; readonly projectionPending: boolean }
  | { readonly ok: false };

export interface MapLifecycleDependencies {
  readonly resolvePrincipals?: typeof resolveMapPrincipals;
  readonly archiveMap?: typeof archiveAuthorizedMap;
  readonly restoreMap?: typeof restoreAuthorizedMap;
  readonly requestPurge?: typeof requestAuthorizedMapPurge;
  readonly projectAccess?: typeof projectMapAccess;
  readonly acknowledgeAccess?: typeof acknowledgeMapAccessChanges;
}

async function finishCapturedLifecycleProjection(
  pending: PendingMapAccessChange,
  project: () => Promise<ProjectionResult>,
  acknowledgeAccess: typeof acknowledgeMapAccessChanges,
  label: string,
): Promise<LifecycleResult> {
  try {
    requireCurrentProjection(await project());
    await acknowledgeAccess([pending]);
    return { ok: true, projectionPending: false };
  } catch (cause) {
    if (!(cause instanceof ProjectionUnavailableError)) throw cause;
    console.error(label, {
      mapId: pending.mapId,
      cause,
    });
    return { ok: true, projectionPending: true };
  }
}

export async function deleteMapForUser(
  userId: string,
  input: MapLifecycleRequest,
  dependencies: MapLifecycleDependencies = {},
): Promise<LifecycleResult> {
  const principals = await (dependencies.resolvePrincipals ?? resolveMapPrincipals)(userId);
  const pending = await (dependencies.archiveMap ?? archiveAuthorizedMap)(
    userId,
    principals,
    input.mapId,
  );
  if (!pending) return { ok: false };
  // A restore may have completed while the archive write was returning.
  // Project current state so delayed delivery cannot revoke restored access.
  return finishCapturedLifecycleProjection(
    pending,
    () => (dependencies.projectAccess ?? projectMapAccess)(input.mapId),
    dependencies.acknowledgeAccess ?? acknowledgeMapAccessChanges,
    '[maps] archived map projection pending resync',
  );
}

export async function restoreMapForUser(
  userId: string,
  input: MapLifecycleRequest,
  dependencies: MapLifecycleDependencies = {},
): Promise<LifecycleResult> {
  const principals = await (dependencies.resolvePrincipals ?? resolveMapPrincipals)(userId);
  const pending = await (dependencies.restoreMap ?? restoreAuthorizedMap)(
    userId,
    principals,
    input.mapId,
  );
  if (!pending) return { ok: false };
  return finishCapturedLifecycleProjection(
    pending,
    () => (dependencies.projectAccess ?? projectMapAccess)(input.mapId),
    dependencies.acknowledgeAccess ?? acknowledgeMapAccessChanges,
    '[maps] restored map projection pending resync',
  );
}

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

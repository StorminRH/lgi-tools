import { resolveMapPrincipals } from '@/composition/map-access';
import {
  projectMapAccess,
  ProjectionUnavailableError,
  requireCurrentProjection,
} from '@/composition/map-access-projection';
import type { MapLifecycleRequest } from '@/data/maps/api-contract';
import {
  archiveAuthorizedMap,
  requestAuthorizedMapPurge,
  restoreAuthorizedMap,
} from '@/data/maps/lifecycle';
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

async function transitionMapForUser(
  userId: string,
  input: MapLifecycleRequest,
  dependencies: MapLifecycleDependencies,
  { write, label }: { readonly write: typeof archiveAuthorizedMap; readonly label: string },
): Promise<LifecycleResult> {
  const principals = await (dependencies.resolvePrincipals ?? resolveMapPrincipals)(userId);
  const pending = await write(userId, principals, input.mapId);
  if (!pending) return { ok: false };
  // Project current state, not the captured write: an opposite transition may
  // have completed while this write was returning, and delayed delivery must
  // not undo it.
  try {
    requireCurrentProjection(
      await (dependencies.projectAccess ?? projectMapAccess)(input.mapId),
    );
    await (dependencies.acknowledgeAccess ?? acknowledgeMapAccessChanges)([pending]);
    return { ok: true, projectionPending: false };
  } catch (cause) {
    if (!(cause instanceof ProjectionUnavailableError)) throw cause;
    console.error(label, { mapId: pending.mapId, cause });
    return { ok: true, projectionPending: true };
  }
}

export function deleteMapForUser(
  userId: string,
  input: MapLifecycleRequest,
  dependencies: MapLifecycleDependencies = {},
): Promise<LifecycleResult> {
  return transitionMapForUser(userId, input, dependencies, {
    write: dependencies.archiveMap ?? archiveAuthorizedMap,
    label: '[maps] archived map projection pending resync',
  });
}

export function restoreMapForUser(
  userId: string,
  input: MapLifecycleRequest,
  dependencies: MapLifecycleDependencies = {},
): Promise<LifecycleResult> {
  return transitionMapForUser(userId, input, dependencies, {
    write: dependencies.restoreMap ?? restoreAuthorizedMap,
    label: '[maps] restored map projection pending resync',
  });
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

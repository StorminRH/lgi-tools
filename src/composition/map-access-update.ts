import { resolveMapPrincipals } from '@/composition/map-access';
import {
  projectMapAccess,
  ProjectionUnavailableError,
} from '@/composition/map-access-projection';
import type { UpdateMapAccessRequest } from '@/data/maps/api-contract';
import { applyAuthorizedMapGrantChange } from '@/data/maps/queries';

export type ResolvePrincipals = typeof resolveMapPrincipals;
export type ApplyGrantChange = typeof applyAuthorizedMapGrantChange;
export type ProjectAccess = typeof projectMapAccess;

export interface MapAccessUpdateDependencies {
  readonly resolvePrincipals?: ResolvePrincipals;
  readonly applyGrantChange?: ApplyGrantChange;
  readonly projectAccess?: ProjectAccess;
}

export type MapAccessUpdateResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'forbidden' }
  | {
      readonly ok: false;
      readonly reason: 'projection-unavailable';
      readonly cause: ProjectionUnavailableError;
    };

export async function applyMapAccessUpdate(
  userId: string,
  input: UpdateMapAccessRequest,
  dependencies: MapAccessUpdateDependencies = {},
): Promise<MapAccessUpdateResult> {
  const resolvePrincipals = dependencies.resolvePrincipals ?? resolveMapPrincipals;
  const applyGrantChange =
    dependencies.applyGrantChange ?? applyAuthorizedMapGrantChange;
  const projectAccess = dependencies.projectAccess ?? projectMapAccess;
  const principals = await resolvePrincipals(userId);

  const change = input.operation === 'upsert'
    ? { operation: input.operation, grant: input.grant }
    : { operation: input.operation, principal: input.principal };
  const authorized = await applyGrantChange(userId, principals, input.mapId, change);
  if (!authorized) return { ok: false, reason: 'forbidden' };
  try {
    await projectAccess(input.mapId);
    return { ok: true };
  } catch (cause) {
    if (cause instanceof ProjectionUnavailableError) {
      return { ok: false, reason: 'projection-unavailable', cause };
    }
    throw cause;
  }
}

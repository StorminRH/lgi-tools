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

/** Closed result from one admin-authorized durable grant edit and re-projection. */
export type MapAccessUpdateResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'forbidden' }
  | {
      readonly ok: false;
      readonly reason: 'projection-unavailable';
      readonly cause: ProjectionUnavailableError;
    };

/**
 * Resolves the caller's principals, atomically requires admin authority on an
 * active map while committing one set-shaped Neon grant change, then reconverges
 * the sole one-way Convex projection. Durable Neon truth remains authoritative
 * when projection is unavailable, so an identical retry heals it.
 */
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

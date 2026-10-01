import { resolveMapPrincipals } from '@/composition/map-access';
import {
  projectMapAccess,
  ProjectionUnavailableError,
  requireCurrentProjection,
} from '@/composition/map-access-projection';
import type { MapPrincipals } from '@/data/maps/access';
import type { MapGrantRequest, UpdateMapAccessRequest } from '@/data/maps/api-contract';
import type { PendingMapAccessChange } from '@/data/maps/authorization-sql';
import { applyAuthorizedMapGrantChange } from '@/data/maps/queries';
import { acknowledgeMapAccessChanges } from '@/platform/auth/affiliation-store';
import { writeMapBlock, type MapBlockWriters } from './map-block-update';

export type ResolvePrincipals = typeof resolveMapPrincipals;
export type ApplyGrantChange = typeof applyAuthorizedMapGrantChange;
export type ProjectAccess = typeof projectMapAccess;
export type AcknowledgeAccess = typeof acknowledgeMapAccessChanges;

export interface MapAccessUpdateDependencies extends MapBlockWriters {
  readonly resolvePrincipals?: ResolvePrincipals;
  readonly applyGrantChange?: ApplyGrantChange;
  readonly projectAccess?: ProjectAccess;
  readonly acknowledgeAccess?: AcknowledgeAccess;
}

export type MapAccessUpdateResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: 'forbidden' | 'creator-character-required' | 'block-self' | 'block-owner';
    }
  | {
      readonly ok: false;
      readonly reason: 'projection-unavailable';
      readonly cause: ProjectionUnavailableError;
    };

type WriteResult =
  | { readonly ok: true; readonly pending: PendingMapAccessChange }
  | Exclude<MapAccessUpdateResult, { readonly ok: true } | { readonly reason: 'projection-unavailable' }>;

async function writeGrantChange(
  userId: string,
  principals: MapPrincipals,
  input: MapGrantRequest,
  dependencies: MapAccessUpdateDependencies,
): Promise<WriteResult> {
  const applyGrantChange =
    dependencies.applyGrantChange ?? applyAuthorizedMapGrantChange;
  const change = input.operation === 'upsert'
    ? { operation: input.operation, grant: input.grant }
    : { operation: input.operation, principal: input.principal };
  const pending = await applyGrantChange(userId, principals, input.mapId, change);
  if (pending === null) return { ok: false, reason: 'forbidden' };
  return 'reason' in pending ? { ok: false, reason: pending.reason } : { ok: true, pending };
}

export async function applyMapAccessUpdate(
  userId: string,
  input: UpdateMapAccessRequest,
  dependencies: MapAccessUpdateDependencies = {},
): Promise<MapAccessUpdateResult> {
  const resolvePrincipals = dependencies.resolvePrincipals ?? resolveMapPrincipals;
  const projectAccess = dependencies.projectAccess ?? projectMapAccess;
  const acknowledgeAccess = dependencies.acknowledgeAccess ?? acknowledgeMapAccessChanges;
  const principals = await resolvePrincipals(userId);

  const written = input.operation === 'block' || input.operation === 'unblock'
    ? await writeMapBlock(userId, principals, input, dependencies)
    : await writeGrantChange(userId, principals, input, dependencies);
  if (!written.ok) return written;
  try {
    requireCurrentProjection(await projectAccess(input.mapId));
    await acknowledgeAccess([written.pending]);
    return { ok: true };
  } catch (cause) {
    if (cause instanceof ProjectionUnavailableError) {
      return { ok: false, reason: 'projection-unavailable', cause };
    }
    throw cause;
  }
}

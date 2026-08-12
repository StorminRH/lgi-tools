import { z } from 'zod';
import { teardownMapAccessProjection } from '@/composition/map-access-projection';
import {
  listPurgeableMaps,
  tombstonePurgedMap,
} from '@/data/maps/lifecycle';
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';

const mapPurgeResponseSchema = z.strictObject({
  deleted: z.number().int().nonnegative(),
  remaining: z.literal(false),
});

/** Thrown when the collaborative purge cannot prove a clean terminal state. */
export class MapPurgeUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'MapPurgeUnavailableError';
  }
}

function requirePurgeTransport(): { readonly url: string; readonly secret: string } {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = readEnv('CONVEX_SERVICE_SECRET');
  const siteUrl = convexUrl ? deriveConvexSiteUrl(convexUrl) : null;
  if (siteUrl === null || !secret) {
    throw new MapPurgeUnavailableError(
      'Map purge unavailable: Convex URL or service secret is unset',
    );
  }
  return { url: `${siteUrl}/purge-map-chain`, secret };
}

async function postPurgeRequest(
  url: string,
  secret: string,
  mapId: string,
): Promise<Response> {
  try {
    return await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ mapId }),
    });
  } catch (cause) {
    throw new MapPurgeUnavailableError('Map purge request failed', { cause });
  }
}

async function decodePurgeResponse(
  response: Response,
): Promise<{ readonly deleted: number; readonly remaining: false }> {
  if (!response.ok) {
    throw new MapPurgeUnavailableError(`Map purge answered ${response.status}`);
  }
  let raw: unknown;
  try {
    raw = await response.json();
  } catch (cause) {
    throw new MapPurgeUnavailableError('Map purge returned unreadable JSON', { cause });
  }
  const parsed = mapPurgeResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new MapPurgeUnavailableError('Map purge returned a drifted response');
  }
  return parsed.data;
}

/** Drives the bearer-gated bounded Convex purge door for exactly one map. */
export async function purgeMapChain(
  mapId: string,
): Promise<{ readonly deleted: number; readonly remaining: false }> {
  const transport = requirePurgeTransport();
  const response = await postPurgeRequest(transport.url, transport.secret, mapId);
  return await decodePurgeResponse(response);
}

interface MapPurgeDependencies {
  readonly listMaps?: typeof listPurgeableMaps;
  readonly purgeChain?: typeof purgeMapChain;
  readonly tombstoneMap?: typeof tombstonePurgedMap;
  readonly teardownAccess?: typeof teardownMapAccessProjection;
}

/**
 * Purges one bounded due-map set. Each row is tombstoned only after the
 * collaborative door proves no map-keyed rows remain.
 */
export async function purgeEligibleMaps(
  dependencies: MapPurgeDependencies = {},
): Promise<{
  readonly selected: number;
  readonly tombstoned: number;
  readonly deletedDocuments: number;
  readonly projectionPending: number;
}> {
  const listMaps = dependencies.listMaps ?? listPurgeableMaps;
  const purgeChain = dependencies.purgeChain ?? purgeMapChain;
  const tombstoneMap = dependencies.tombstoneMap ?? tombstonePurgedMap;
  const teardownAccess = dependencies.teardownAccess ?? teardownMapAccessProjection;
  const due = await listMaps();
  let tombstoned = 0;
  let deletedDocuments = 0;
  let projectionPending = 0;

  for (const map of due) {
    const purge = await purgeChain(map.id);
    if (purge.remaining) {
      throw new MapPurgeUnavailableError(
        `Map purge did not finish for ${map.id}`,
      );
    }
    const marked = await tombstoneMap(map.id);
    if (!marked) {
      throw new MapPurgeUnavailableError(
        `Map ${map.id} changed lifecycle state before tombstone`,
      );
    }
    tombstoned += 1;
    deletedDocuments += purge.deleted;
    try {
      await teardownAccess(map.id);
    } catch (cause) {
      projectionPending += 1;
      console.error('[maps] post-tombstone access teardown pending resync', {
        mapId: map.id,
        cause,
      });
    }
  }
  return { selected: due.length, tombstoned, deletedDocuments, projectionPending };
}

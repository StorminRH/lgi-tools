import type { NextRequest } from 'next/server';
import { SITE_TYPES, WORMHOLE_CLASSES } from '@/features/wormhole-sites/schema';
import { listSites } from '@/features/wormhole-sites/queries';
import type { ApiError, SiteListItem, SiteType, WormholeClass } from '@/features/wormhole-sites/types';

// API response shape: makes the ISK source explicit so consumers
// can't mistake the Sheet's static rollup for the live-overlaid
// value returned by /api/sites/[id]. The list endpoint never
// fetches per-resource rows, so it never applies the live overlay.
type SiteListApiItem = Omit<SiteListItem, 'resourceValueIsk'> & {
  sheetResourceValueIsk: SiteListItem['resourceValueIsk'];
};

function toApiShape({ resourceValueIsk, ...rest }: SiteListItem): SiteListApiItem {
  return { ...rest, sheetResourceValueIsk: resourceValueIsk };
}

export async function GET(
  request: NextRequest
): Promise<Response> {
  const { searchParams } = request.nextUrl;

  const rawType = searchParams.get('type');
  const rawClass = searchParams.get('class');

  if (rawType !== null && !(SITE_TYPES as readonly string[]).includes(rawType)) {
    return Response.json(
      { error: `Invalid type. Must be one of: ${SITE_TYPES.join(', ')}` } satisfies ApiError,
      { status: 400 }
    );
  }

  if (rawClass !== null && !(WORMHOLE_CLASSES as readonly string[]).includes(rawClass)) {
    return Response.json(
      { error: `Invalid class. Must be one of: ${WORMHOLE_CLASSES.join(', ')}` } satisfies ApiError,
      { status: 400 }
    );
  }

  const result: SiteListItem[] = await listSites({
    type: rawType !== null ? (rawType as SiteType) : undefined,
    wormholeClass: rawClass !== null ? (rawClass as WormholeClass) : undefined,
  });

  return Response.json(result.map(toApiShape));
}

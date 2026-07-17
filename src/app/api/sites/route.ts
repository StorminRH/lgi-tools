import type { NextRequest } from 'next/server';
import type { SiteListApiItem } from '@/features/wormhole-sites/api-contract';
import { listSites } from '@/features/wormhole-sites/queries';
import { parseSitesQuery } from '@/features/wormhole-sites/sites-query';
import type { ApiError, SiteListItem } from '@/features/wormhole-sites/types';

function toApiShape({ resourceValueIsk, ...rest }: SiteListItem): SiteListApiItem {
  return { ...rest, sheetResourceValueIsk: resourceValueIsk };
}

/**
 * Handles GET requests for /api/sites; this route owns its authorization, boundary validation, and
 * typed response mapping.
 */
// authz: public
export async function GET(request: NextRequest): Promise<Response> {
  const parsed = parseSitesQuery(
    request.nextUrl.searchParams.get('type'),
    request.nextUrl.searchParams.get('class'),
  );
  if (!parsed.ok) {
    return Response.json(parsed.error satisfies ApiError, { status: 400 });
  }

  const result: SiteListItem[] = await listSites({
    type: parsed.data.type,
    wormholeClass: parsed.data.class,
  });

  return Response.json(result.map(toApiShape) satisfies SiteListApiItem[]);
}

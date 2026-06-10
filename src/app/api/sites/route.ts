import type { NextRequest } from 'next/server';
import {
  sitesQuerySchema,
  type SiteListApiItem,
} from '@/features/wormhole-sites/api-contract';
import { SITE_TYPES, WORMHOLE_CLASSES } from '@/features/wormhole-sites/schema';
import { listSites } from '@/features/wormhole-sites/queries';
import type { ApiError, SiteListItem } from '@/features/wormhole-sites/types';

function toApiShape({ resourceValueIsk, ...rest }: SiteListItem): SiteListApiItem {
  return { ...rest, sheetResourceValueIsk: resourceValueIsk };
}

// authz: public
export async function GET(request: NextRequest): Promise<Response> {
  const parsed = sitesQuerySchema.safeParse({
    type: request.nextUrl.searchParams.get('type') ?? undefined,
    class: request.nextUrl.searchParams.get('class') ?? undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path.join('.') ?? 'query';
    const expected =
      field === 'type'
        ? SITE_TYPES.join(', ')
        : field === 'class'
          ? WORMHOLE_CLASSES.join(', ')
          : '';
    return Response.json(
      { error: `Invalid ${field}. Must be one of: ${expected}` } satisfies ApiError,
      { status: 400 },
    );
  }

  const result: SiteListItem[] = await listSites({
    type: parsed.data.type,
    wormholeClass: parsed.data.class,
  });

  return Response.json(result.map(toApiShape) satisfies SiteListApiItem[]);
}

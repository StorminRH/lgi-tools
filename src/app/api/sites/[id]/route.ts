import { z } from 'zod';
import { overlayLivePrices } from '@/features/wormhole-sites/live-prices';
import { getSiteDetail } from '@/features/wormhole-sites/queries';
import type { ApiError, SiteDetail } from '@/features/wormhole-sites/types';

// Postgres `serial` is signed 32-bit, so site IDs cannot exceed this. Reject
// anything outside that range up-front so we don't hand the DB a number it'll
// refuse with a 500.
const PG_SERIAL_MAX = 2_147_483_647;

// Plain positive decimal only — no leading zeros, no signs, no whitespace,
// no hex/scientific notation, no trailing garbage that parseInt would
// silently strip.
const idParamSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(z.number().int().positive().max(PG_SERIAL_MAX)),
});

// authz: public
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = idParamSchema.safeParse(await params);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid id' } satisfies ApiError, { status: 400 });
  }

  const raw: SiteDetail | null = await getSiteDetail(parsed.data.id);

  if (!raw) {
    return Response.json({ error: 'Not found' } satisfies ApiError, { status: 404 });
  }

  const [site] = await overlayLivePrices([raw]);
  return Response.json(site);
}

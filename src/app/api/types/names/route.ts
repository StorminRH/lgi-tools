// POST /api/types/names
// Bulk type-id → name resolution from the Neon SDE (3.4.7). Public read of
// static SDE data — the skill-queue island resolves the skill ids in a
// pilot's Convex docs here at render time, so domain data never lives in
// Convex. Per-request by nature (user-posted ids).
// authz: public
import {
  typeNamesRequestSchema,
  type TypeNamesResponse,
} from '@/data/eve-data/api-contract';
import { getTypeNames } from '@/data/eve-data/queries';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const parsed = typeNamesRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid body';
    return new Response(detail, { status: 400 });
  }

  const names = await getTypeNames(parsed.data.typeIds);
  return Response.json({
    names: Object.fromEntries(
      [...names.entries()].map(([id, name]) => [String(id), name]),
    ),
  } satisfies TypeNamesResponse);
}

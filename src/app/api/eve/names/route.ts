// POST /api/eve/names
// Bulk entity-id → name resolution for characters + corporations (3.7.3.4),
// resolved through the one ESI gate's /universe/names. The merged active-jobs
// board resolves installer + corporation names here at view time, so entity
// names never live in Convex. Per-request by nature (client-posted ids).
// authz: public
import {
  entityNamesRequestSchema,
  type EntityNamesResponse,
} from '@/data/eve-data/api-contract';
import { resolveEntityNames } from '@/data/eve-data/entity-names';

export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const parsed = entityNamesRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid body';
    return new Response(detail, { status: 400 });
  }

  const names = await resolveEntityNames(parsed.data.ids);
  return Response.json({ names } satisfies EntityNamesResponse);
}

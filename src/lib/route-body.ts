import type { z } from 'zod';

// Shared JSON-body validation for route handlers (the tidy the fallow baseline
// README anticipated): read the request body, validate it against a Zod schema,
// and on failure hand back the exact 400 Response the route returns as-is — so a
// handler's happy path is `if (!parsed.ok) return parsed.response;` instead of the
// repeated try/catch + safeParse + first-issue formatting. Lives in lib (imports
// only zod's type), so any slice's route can use it.
export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: Response };

export async function parseJsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<ParsedBody<z.infer<S>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: new Response('Invalid JSON', { status: 400 }) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid body';
    return { ok: false, response: new Response(detail, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}

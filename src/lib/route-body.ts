import type { z } from 'zod';

// Shared JSON-body validation for route handlers (the tidy the fallow baseline
// README anticipated): read the request body, validate it against a Zod schema,
// and on failure hand back the exact 400 Response the route returns as-is — so a
// handler's happy path is `if (!parsed.ok) return parsed.response;` instead of the
// repeated try/catch + safeParse + first-issue formatting. Lives in lib (imports
// only zod's type), so any slice's route can use it.
export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: Response };

// Routes with a JSON error contract (the planner/market on-view family) override
// the default plain-text 400s so their per-slice `satisfies` pins stay at the
// call site; everything else takes the defaults.
export interface ParseJsonBodyErrors {
  invalidJson: () => Response;
  invalidBody: (error: z.ZodError) => Response;
}

// Form-POST twin of parseJsonBody for the redirect-style admin/account forms:
// the caller picks its fields off the FormData (each form posts a different
// hidden-input set) and owns the 400 copy, so error texts stay per-route.
export async function parseFormBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  pick: (form: FormData) => unknown,
  invalid: (error: z.ZodError) => Response,
): Promise<ParsedBody<z.infer<S>>> {
  const form = await request.formData();
  const parsed = schema.safeParse(pick(form));
  if (!parsed.success) {
    return { ok: false, response: invalid(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}

export async function parseJsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  errors?: ParseJsonBodyErrors,
): Promise<ParsedBody<z.infer<S>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: errors ? errors.invalidJson() : new Response('Invalid JSON', { status: 400 }),
    };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    if (errors) return { ok: false, response: errors.invalidBody(parsed.error) };
    const issue = parsed.error.issues[0];
    const detail = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'invalid body';
    return { ok: false, response: new Response(detail, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}

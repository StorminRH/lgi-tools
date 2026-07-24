import type { z } from 'zod';
import { validationFailure, type AppFailure } from '@/lib/failure';

/** Typed success-or-error result shared by transport-level request-body parsers. */
export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: Response };

/**
 * Routes with a JSON error contract (the planner/market on-view family) override
 * the default plain-text 400s so their per-slice `satisfies` pins stay at the
 * call site; everything else takes the defaults.
 */
export interface ParseJsonBodyErrors {
  invalidJson: () => Response;
  invalidBody: (error: z.ZodError) => Response;
}

/** Typed JSON-body core result carrying application failures instead of HTTP responses. */
export type ReadJsonBodyResult<T> =
  | { ok: true; data: T }
  | { ok: false; failure: AppFailure; zodError?: z.ZodError };

/** Parses and validates JSON while leaving delivery-boundary response construction to the caller. */
export async function readJsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<ReadJsonBodyResult<z.infer<S>>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      failure: validationFailure('invalid_json', 'Invalid JSON'),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const detail = issue
      ? `${issue.path.join('.') || 'body'}: ${issue.message}`
      : 'invalid body';
    return {
      ok: false,
      failure: validationFailure('invalid_body', detail),
      zodError: parsed.error,
    };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Form-POST twin of parseJsonBody for the redirect-style admin/account forms:
 * the caller picks its fields off the FormData (each form posts a different
 * hidden-input set) and owns the 400 copy, so error texts stay per-route.
 */
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

/**
 * Parses and validates a request JSON body with the supplied Zod schema, returning a typed value
 * or the standard 400 response.
 */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  errors?: ParseJsonBodyErrors,
): Promise<ParsedBody<z.infer<S>>> {
  const parsed = await readJsonBody(request, schema);
  if (parsed.ok) return parsed;
  if (errors) {
    return {
      ok: false,
      response: parsed.zodError
        ? errors.invalidBody(parsed.zodError)
        : errors.invalidJson(),
    };
  }
  return {
    ok: false,
    response: new Response(parsed.failure.detail ?? 'invalid body', { status: 400 }),
  };
}

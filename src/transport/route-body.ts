import type { z } from 'zod';
import { validationFailure, type AppFailure } from '@/lib/failure';

/** Typed form-body result carrying an application failure instead of an HTTP response. */
export type ParsedFormBody<T> =
  | { ok: true; data: T }
  | { ok: false; failure: AppFailure };

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
 * Form-body parser for the redirect-style admin/account routes:
 * the caller picks its fields off the FormData (each form posts a different
 * hidden-input set) and owns the 400 copy, so error texts stay per-route.
 */
export async function parseFormBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  pick: (form: FormData) => unknown,
  invalid: (error: z.ZodError) => AppFailure,
): Promise<ParsedFormBody<z.infer<S>>> {
  const form = await request.formData();
  const parsed = schema.safeParse(pick(form));
  if (!parsed.success) {
    return { ok: false, failure: invalid(parsed.error) };
  }
  return { ok: true, data: parsed.data };
}
